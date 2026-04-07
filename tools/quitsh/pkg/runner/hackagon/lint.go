package hackagonrunner

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/debug"
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
	return nil
}
