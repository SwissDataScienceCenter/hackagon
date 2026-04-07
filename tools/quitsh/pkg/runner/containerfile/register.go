package containerfilerunner

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
	imageSettings *config.ImageSettings,
	factory factory.IFactory,
) (err error) {
	log.Trace("Register runner.", "id", ContainerfileRunnerID)

	e := factory.Register(
		ContainerfileRunnerID,
		runner.RunnerData{
			Creator: func(config step.AuxConfig) (runner.IRunner, error) {
				return NewContainerfileBuildRunner(config, imageSettings)
			},
			RunnerConfigUnmarshal: UnmarshalImageConfig,
			DefaultToolchain:      "image-containerfile",
		})
	err = errors.Combine(err, e)
	e = factory.RegisterToKey(
		runner.NewRegisterKey("image", "containerfile"),
		ContainerfileRunnerID,
	)
	err = errors.Combine(err, e)

	return
}
