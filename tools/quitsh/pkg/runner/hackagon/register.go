package hackagonrunner

import (
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/component/step"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
	"github.com/sdsc-ordes/quitsh/pkg/runner/factory"
)

// Register registers the runners in the factory.
func Register(
	lintSettings *config.LintSettings,
	factory factory.IFactory,
) (err error) {
	log.Trace("Register runner.", "id", GeneralLintRunnerID)

	e := factory.Register(
		GeneralLintRunnerID,
		runner.RunnerData{
			Creator: func(config step.AuxConfig) (runner.IRunner, error) {
				return NewGeneralLintRunner(config, lintSettings)
			},
			RunnerConfigUnmarshal: UnmarshalLintConfig,
			DefaultToolchain:      "ci",
		})

	err = errors.Combine(err, e)
	e = factory.RegisterToKey(runner.NewRegisterKey("lint", "general"), GeneralLintRunnerID)
	err = errors.Combine(err, e)

	return err
}
