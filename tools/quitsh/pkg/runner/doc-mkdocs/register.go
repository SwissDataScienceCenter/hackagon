package docmkdocsrunner

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
	log.Trace("Register runner.", "id", DocMkDocsRunnerID)

	e := factory.Register(
		DocMkDocsRunnerID,
		runner.RunnerData{
			Creator: func(_config step.AuxConfig) (runner.IRunner, error) {
				return NewMkDocsBuildRunner()
			},
			DefaultToolchain:      "doc-mkdocs",
			RunnerConfigUnmarshal: nil,
		})
	err = errors.Combine(err, e)
	e = factory.RegisterToKey(
		runner.NewRegisterKey("build", "doc-mkdocs"),
		DocMkDocsRunnerID,
	)
	err = errors.Combine(err, e)

	return
}
