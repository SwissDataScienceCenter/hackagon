package nodepnpmrunner

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/exec/pnpm"
	"os"
	"path"
	"path/filepath"

	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/debug"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
	"github.com/sdsc-ordes/quitsh/pkg/runner/config"
)

const NodePnpmBuildRunnerID = "quitsh::build-node-pnpm"

type NodePnpmBuildRunner struct {
	runnerConfig *RunnerConfigBuild
	settings     config.IBuildSettings
}

// NewNodePnpmBuildRunner constructs a new NodePnpmBuildRunner with its own config.
// It is accompanied by the Nix build-support function `buildNodePackage`.
func NewNodePnpmBuildRunner(config any, settings config.IBuildSettings) (runner.IRunner, error) {
	debug.Assert(config != nil, "config is nil")

	return &NodePnpmBuildRunner{
		runnerConfig: common.Cast[*RunnerConfigBuild](config),
		settings:     settings,
	}, nil
}

func (*NodePnpmBuildRunner) ID() runner.RegisterID {
	return NodePnpmBuildRunnerID
}

// Run builds a node project with `pnpm` on a `build-dev`/`build-prod`
// target in the `package.json`.
func (r *NodePnpmBuildRunner) Run(ctx runner.IContext) error {
	log := ctx.Log()
	comp := ctx.Component()

	log.Info("Starting node (pnpm) build for component.", "component", comp.Name())

	outDir := comp.OutBuildShareDir()
	outDirModules := comp.OutBuildShareDir("node_modules")

	// NOTE: Must be an absolute path, otherwise dumb pnpm does not work:
	// https://github.com/pnpm/pnpm/issues/5800
	outDirModulesRel, err := filepath.Rel(comp.Root(), outDirModules)
	if err != nil {
		return errors.AddContext(
			err,
			"could not determine rel. dir to comp root '%s' from '%s'",
			comp.Root(),
			outDirModules,
		)
	}

	err = os.RemoveAll(outDir)
	if err != nil {
		return err
	}
	fs.AssertDirs(comp.OutBuildShareDir())

	builder := pnpm.NewCtxBuilder().
		Cwd(comp.Root()).
		// To control the out dir in the build process.
		Env("QUITSH_BUILD_DIR=" + outDir)

	buildTarget := "build:dev"

	if r.settings.EnvironmentType() != common.EnvironmentDev {
		log.Info("Setting 'NODE_ENV' to 'production'.")
		builder.Env("NODE_ENV=production")
		buildTarget = "build:prod"
	}

	pnpmCtx := builder.Build()

	log.Info(
		"Run install & build.",
		"env-type",
		r.settings.EnvironmentType(),
		"target",
		buildTarget,
	)
	err = pnpmCtx.Chain().Check("install").Check(buildTarget).Error()
	if err != nil {
		log.ErrorE(err, "Install & build failed.")

		return err
	}

	log.Info("Install 'node_modules' with no 'devDepenendies'.")

	// NOTE: As always with stupid Node tools, (buggy) we need a full configuration here
	// otherwise `.pnpm` folder stays somewhere else, resulting in wrong symlinks.
	err = pnpmCtx.Check("install",
		"--force", //  Buggy as it wants to prompt for dir removal etc... (its empty!)
		"--ignore-scripts",
		"--production",
		"--frozen-lockfile",
		"--modules-dir",
		outDirModulesRel,
		"--virtual-store-dir",
		path.Join(outDirModulesRel, ".pnpm"),
		"--global-dir",
		outDirModulesRel,
	)

	if err != nil {
		log.ErrorE(err, "Install 'node_modules' for packaging failed.")

		return err
	}

	return nil
}
