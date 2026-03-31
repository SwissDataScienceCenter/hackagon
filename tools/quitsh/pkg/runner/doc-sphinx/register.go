package docsphinxrunner

import (
	"github.com/sdsc-ordes/quitsh/pkg/component/step"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
	"github.com/sdsc-ordes/quitsh/pkg/runner/factory"
)

func Register(
	factory factory.IFactory,
) (err error) {
	log.Trace("Register runner.", "id", DocSphinxRunnerID)

	e := factory.Register(
		DocSphinxRunnerID,
		runner.RunnerData{ //nolint:exhaustruct
			Creator: func(_config step.AuxConfig) (runner.IRunner, error) {
				return NewSphinxBuildRunner()
			},
			DefaultToolchain: "doc-sphinx",
		})
	err = errors.Combine(err, e)
	e = factory.RegisterToKey(
		runner.NewRegisterKey("build", "doc-sphinx"),
		DocSphinxRunnerID,
	)
	err = errors.Combine(err, e)

	return
}
