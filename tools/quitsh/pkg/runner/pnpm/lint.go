package nodepnpmrunner

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/exec/pnpm"

	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/debug"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
	"github.com/sdsc-ordes/quitsh/pkg/runner/config"
)

const NodePnpmLintRunnerID = "quitsh::lint-node-pnpm"

type NodePnpmLintRunner struct {
	runnerConfig *RunnerConfigLint
	settings     config.IBuildSettings
}

// NewNodePnpmLintRunner constructs a new NodePnpmLintRunner with its own config.
// It is accompanied by the Nix build-support function `buildNodePackage`.
func NewNodePnpmLintRunner(config any, settings config.IBuildSettings) (runner.IRunner, error) {
	debug.Assert(config != nil, "config is nil")

	return &NodePnpmLintRunner{
		runnerConfig: common.Cast[*RunnerConfigLint](config),
		settings:     settings,
	}, nil
}

func (*NodePnpmLintRunner) ID() runner.RegisterID {
	return NodePnpmLintRunnerID
}

// Run lint on a node project with `pnpm` on a `lint` target in the `package.json`.
func (r *NodePnpmLintRunner) Run(ctx runner.IContext) error {
	log := ctx.Log()
	comp := ctx.Component()

	log.Info("Starting lint for component.", "component", comp.Name())

	builder := pnpm.NewCtxBuilder().Cwd(comp.Root())
	pnpmCtx := builder.Build()

	log.Info("Run install & lint.")

	err := pnpmCtx.Chain().Check("install").Check("run", "lint").Error()
	if err != nil {
		log.ErrorE(err, "Install & lint failed.")

		return err
	}

	return nil
}
