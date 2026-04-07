package nixrunner

import (
	"fmt"
	"os"
	"path"

	cnNix "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/exec/nix"
	cnImages "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/image"
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/component/step"
	"github.com/sdsc-ordes/quitsh/pkg/debug"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/exec/nix"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"
	"github.com/sdsc-ordes/quitsh/pkg/image"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
)

const NixImageRunnerID = "hackagon::image-nix"

type NixImageRunner struct {
	flakeDirRel string
	config      *RunnerConfigImage
	imgSetts    *config.ImageSettings
	nixSetts    *config.NixSettings
}

// NewNixImageRunner constructs a new NixImageRunner with its own config.
func NewNixImageRunner(
	flakeDirRel string,
	conf step.AuxConfig,
	imgSetts *config.ImageSettings,
	nixSetts *config.NixSettings,
) (runner.IRunner, error) {
	debug.Assert(conf != nil, "config is nil")

	return &NixImageRunner{
		flakeDirRel: flakeDirRel,
		config:      common.Cast[*RunnerConfigImage](conf),
		imgSetts:    imgSetts,
		nixSetts:    nixSetts,
	}, nil
}

func (*NixImageRunner) ID() runner.RegisterID {
	return NixImageRunnerID
}

func (r *NixImageRunner) Run(ctx runner.IContext) error {
	log := ctx.Log()
	comp := ctx.Component()
	config := comp.Config()
	log.Info("Starting Nix image build for component.", "component", config.Name)

	if r.imgSetts.Build.SkipBuild && !r.imgSetts.Push.Enable {
		return errors.New("you need at least to build or push the images")
	}

	nixctx := nix.NewCtxBuilder().Cwd(ctx.Root()).Build()

	fs.AssertDirs(comp.OutImageDir())

	// Either build the images given on the command line
	// or build the images given in the component config.
	var imageTypes []image.Type
	if r.imgSetts.Build.ImageTypes != nil {
		imageTypes = r.imgSetts.Build.ImageTypes
	} else {
		imageTypes = image.GetAllImageTypes()
	}

	flakePath := path.Join(ctx.Root(), r.nixSetts.FlakeDirRel)
	nixPackages, err := nix.GetFlakePackages(ctx.Root(), flakePath)
	if err != nil {
		return err
	}

	err = r.imgSetts.Push.SourceInfo.Resolve(ctx.Git())
	if err != nil {
		return errors.AddContext(err, "could not resolve source information")
	}

	pkgs := []cnImages.ImagePackage{}

	for i := range imageTypes {
		nixInstallable, nixPkgName := cnNix.NixComponentImageInstallable(
			flakePath, config.Name, imageTypes[i])

		if _, exists := nixPackages[nixPkgName]; !exists {
			continue
		}

		imagePkgName := cnImages.NewImagePackageName(comp.Name(), imageTypes[i])
		imageRef, e := image.NewImageRef(
			r.imgSetts.Push.RegistryDomain,
			r.imgSetts.Push.RegistryBasePathFmt,
			imagePkgName,
			comp.Version(),
			r.imgSetts.Push.RegistryType,
			r.imgSetts.Push.SourceInfo.CommitRef,
			r.imgSetts.Push.UseReleaseTag,
		)
		if e != nil {
			return e
		}

		pkgs = append(
			pkgs,
			cnImages.ImagePackage{ //nolint:exhaustruct
				Component:      config.Name,
				Version:        comp.Version().String(),
				Name:           imagePkgName,
				ImageType:      imageTypes[i],
				NixPackage:     nixPkgName,
				NixInstallable: nixInstallable,
				ImageFile:      comp.OutImageDir(imagePkgName),
				ImageRefs:      []image.ImageRefField{{Ref: imageRef}},
			},
		)
	}

	if len(pkgs) == 0 {
		return errors.New("no image installables found with `%s-<image-type>-image`",
			config.Name)
	}

	if !r.imgSetts.Build.SkipBuild {
		err = buildImages(log, nixctx, pkgs)
		if err != nil {
			return err
		}
	} else {
		log.Warn("Skipping image build.")
	}

	if r.imgSetts.Push.Enable {
		err = cnImages.UploadImages(log, r.imgSetts, pkgs)
		if err != nil {
			return err
		}
	} else {
		log.Warn("Skipping image push.")
	}

	return err
}

func buildImages(
	log log.ILog,
	nixctx *exec.CmdContext,
	pkgs cnImages.ImagePackages,
) error {
	installables := []string{}

	for i := range pkgs {
		log.Info("Building image.",
			"image",
			pkgs[i].ImageFile,
			"ref", pkgs[i].ImageRefs[0].Ref.String())

		installables = append(installables, pkgs[i].NixInstallable)
	}

	outLink := path.Join(path.Dir(pkgs[0].ImageFile), "."+path.Base(pkgs[0].ImageFile))

	cmd := []string{
		"build",
		"-L",
		"--accept-flake-config",
		"--json",
		"--out-link",
		outLink,
	}
	cmd = append(cmd, installables...)
	err := nixctx.Check(cmd...)
	if err != nil {
		return err
	}

	// Rename all results links for better user friendliness.
	// see `nix build`.
	for i := range pkgs {
		oldPath := outLink
		if i != 0 {
			oldPath += fmt.Sprintf("-%v", i)
		}

		err = os.Rename(oldPath, pkgs[i].ImageFile)
		if err != nil {
			return err
		}
	}

	return err
}
