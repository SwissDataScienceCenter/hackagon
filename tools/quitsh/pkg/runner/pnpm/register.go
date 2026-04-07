package nodepnpmrunner

import (
	"github.com/sdsc-ordes/quitsh/pkg/component/step"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
	"github.com/sdsc-ordes/quitsh/pkg/runner/config"
	"github.com/sdsc-ordes/quitsh/pkg/runner/factory"
)

// RegisterAll registers the `pnpm` runners in the factory.
func RegisterAll(
	buildSettings config.IBuildSettings,
	testSettings config.ITestSettings,
	factory factory.IFactory,
	registerKey bool,
) (err error) {
	log.Trace("Register runner.", "id", NodePnpmLintRunnerID)
	e := factory.Register(
		NodePnpmLintRunnerID,
		runner.RunnerData{
			Creator: func(config step.AuxConfig) (runner.IRunner, error) {
				return NewNodePnpmLintRunner(config, buildSettings)
			},
			RunnerConfigUnmarshal: UnmarshalLintConfig,
			DefaultToolchain:      "build-node-pnpm",
		})
	err = errors.Combine(err, e)

	log.Trace("Register runner.", "id", NodePnpmBuildRunnerID)
	e = factory.Register(
		NodePnpmBuildRunnerID,
		runner.RunnerData{
			Creator: func(config step.AuxConfig) (runner.IRunner, error) {
				return NewNodePnpmBuildRunner(config, buildSettings)
			},
			RunnerConfigUnmarshal: UnmarshalBuildConfig,
			DefaultToolchain:      "build-node-pnpm",
		})
	err = errors.Combine(err, e)

	log.Trace("Register runner.", "id", NodePnpmTestRunnerID)
	e = factory.Register(
		NodePnpmTestRunnerID,
		runner.RunnerData{
			Creator: func(config step.AuxConfig) (runner.IRunner, error) {
				return NewNodePnpmTestRunner(config, testSettings)
			},
			RunnerConfigUnmarshal: UnmarshalTestConfig,
			DefaultToolchain:      "build-node-pnpm",
		})
	err = errors.Combine(err, e)

	if registerKey {
		e = factory.RegisterToKey(
			runner.NewRegisterKey("lint", "node-pnpm"),
			NodePnpmLintRunnerID,
		)
		err = errors.Combine(err, e)

		e = factory.RegisterToKey(
			runner.NewRegisterKey("build", "node-pnpm"),
			NodePnpmBuildRunnerID,
		)
		err = errors.Combine(err, e)
		e = factory.RegisterToKey(
			runner.NewRegisterKey("aux", "node-pnpm"),
			NodePnpmBuildRunnerID,
		)
		err = errors.Combine(err, e)

		e = factory.RegisterToKey(
			runner.NewRegisterKey("test", "node-pnpm"),
			NodePnpmTestRunnerID,
		)
		err = errors.Combine(err, e)
	}

	return err
}
