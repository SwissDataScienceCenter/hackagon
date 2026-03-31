package setup

import (
	"os"
	"path"

	"github.com/sdsc-ordes/quitsh/pkg/cli/general"
	"github.com/sdsc-ordes/quitsh/pkg/component"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/exec/git"
	"github.com/sdsc-ordes/quitsh/pkg/exec/shell"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	nixtoolchain "github.com/sdsc-ordes/quitsh/pkg/toolchain/nix"
)

// Setup sets up the development environment.
func Setup(flakeDirRel string) error {
	gitctx, rootDir, err := git.NewCtxAtRoot(".")
	if err != nil {
		return err
	}

	comps, _, err := general.FindComponents(
		&general.ComponentArgs{ComponentPatterns: []string{"*"}},
		rootDir,
		"",
		nil,
		nil,
	)
	if err != nil {
		return err
	}

	flakeDir := path.Join(rootDir, flakeDirRel)

	err = createGoWorkFile(comps, rootDir, flakeDir)
	if err != nil {
		return err
	}

	err = LinkConfigFiles(rootDir)
	if err != nil {
		return err
	}

	err = setupGithooks(gitctx)
	if err != nil {
		return err
	}

	log.Info("Setup successful.")

	return nil
}

func LinkConfigFiles(rootDir string) error {
	log.Info("Link config files.")

	type P struct {
		src       string
		dest      string
		copy      bool
		lazyExist bool
	}

	//nolint:exhaustruct
	links := []P{
		{src: "./tools/configs/typos/typos.toml", dest: ".typos.toml"},
		{src: "./tools/configs/prettier/prettierrc.yaml", dest: ".prettierrc.yaml"},
		{src: "./tools/configs/yamllint/yamllint.yaml", dest: ".yamllint.yaml"},
		{src: "./tools/configs/golangci-lint/golangci.yaml", dest: ".golangci.yaml", copy: false},
		{
			src:       "./tools/configs/rust/rustfmt.toml",
			dest:      ".rustfmt.toml",
			copy:      false,
			lazyExist: true,
		},
		{
			src:       "./tools/configs/taplo/taplo.toml",
			dest:      ".taplo.toml",
			copy:      false,
			lazyExist: true,
		},
	}

	for _, p := range links {
		dest := path.Join(rootDir, p.dest)
		_ = os.Remove(dest)

		src := path.Join(rootDir, p.src)
		if !fs.Exists(src) {
			if p.lazyExist {
				log.Infof("Ignoring non-existing file '%s'.", src)

				continue
			}

			return errors.New("file to link '%s' does not exist", src)
		}

		var err error
		if p.copy {
			err = fs.CopyFileOrDir(src, dest, true)
		} else {
			err = os.Symlink(src, dest)
		}
		if err != nil {
			return err
		}
	}

	return nil
}

func createGoWorkFile(comps []*component.Component, rootDir string, flakeDir string) error {
	log.Info("Create 'go.work' file.")

	// Use the shell to evaluate in one Nix shell, instead of `goCtx`.
	shellCtx := nixtoolchain.WrapOverToolchain(
		exec.NewCmdCtxBuilder().
			Cwd(rootDir).
			BaseCmd("sh").
			BaseArgs("-c"),
		rootDir,
		flakeDir,
		"build-go").Build()

	goWorkCmd := []string{"go", "work", "use"}
	for _, comp := range comps {
		if comp.Config().Language != "go" {
			continue
		}
		goWorkCmd = append(goWorkCmd, comp.Root())
	}

	_ = os.Remove(path.Join(rootDir, "go.work"))
	_ = os.Remove(path.Join(rootDir, "go.work.sum"))

	err := shellCtx.Check(
		"go work init && " + shell.CmdToString(goWorkCmd...))

	if err != nil {
		return err
	}

	return nil
}

func setupGithooks(gitctx git.Context) error {
	err := gitctx.Check("config", "--get", "githooks.runner")
	if err != nil {
		log.Info("No Githooks installed. Not setting up hooks.")

		return nil //nolint: nilerr // intentional nil return
	}

	log.Info("Found 'Githooks' installation trying to setup hooks.")

	gitctx = git.NewCtx(gitctx.Cwd(), func(c *exec.CmdContextBuilder) {
		c.NoQuiet()
	})

	return gitctx.Check("hooks", "install")
}
