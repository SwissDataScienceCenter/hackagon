package hackagonrunner

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/debug"
	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
)

const GeneralLintRunnerID = "hackagon::lint-general"

type (
	GeneralLintRunner struct {
		settings     *config.LintSettings
		runnerConfig *GeneralConfig
	}
)

func NewGeneralLintRunner(config any, settings *config.LintSettings) (runner.IRunner, error) {
	debug.Assert(config != nil, "config is nil")

	return &GeneralLintRunner{
		runnerConfig: common.Cast[*GeneralConfig](config),
		settings:     settings,
	}, nil
}

func (r *GeneralLintRunner) ID() runner.RegisterID {
	return GeneralLintRunnerID
}

func (r *GeneralLintRunner) Run(ctx runner.IContext) error {

	log := ctx.Log()
	comp := ctx.Component()

	log.Info("Starting lint for component.", "component", comp.Name())

	builder := exec.NewCmdCtxBuilder().BaseCmd("buf").Cwd(comp.Root())
	bufCtx := builder.Build()

	log.Info("Run profobuf lint & breaking.")

	err := bufCtx.Chain().Check("lint").Check("breaking", "--against", "https://github.com/swissdatasciencecenter/hackagon.git#branch=main").Error()
	if err != nil {
		log.ErrorE(err, "Protobuf lint&breaking failed.")

		return err
	}

	return nil
}
