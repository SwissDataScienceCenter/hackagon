package coverage

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/component/step"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
	"github.com/sdsc-ordes/quitsh/pkg/runner/factory"
)

// Register registers the runners in the factory.
func Register(
	testSettings *config.TestSettings,
	factory factory.IFactory,
) (err error) {
	log.Trace("Register runner.", "id", CoverageUploadRunnerID)
	e := factory.Register(
		CoverageUploadRunnerID,
		runner.RunnerData{
			Creator: func(config step.AuxConfig) (runner.IRunner, error) {
				return NewCodecovRunner(config, testSettings)
			},
			RunnerConfigUnmarshal: UnmarshalCodecovConfig,
			DefaultToolchain:      "coverage-upload",
		})

	err = errors.Combine(err, e)
	e = factory.RegisterToKey(runner.NewRegisterKey("test",
		"coverage-upload"), CoverageUploadRunnerID)
	err = errors.Combine(err, e)
	e = factory.RegisterToKey(runner.NewRegisterKey("coverage",
		"coverage-upload"), CoverageUploadRunnerID)
	err = errors.Combine(err, e)

	return err
}
