package docmkdocsrunner

import (
	"github.com/sdsc-ordes/quitsh/pkg/exec/python"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
)

const DocMkDocsRunnerID = "hackagon::doc-mkdocs"

type DocMkDocsRunner struct{}

func NewMkDocsBuildRunner() (runner.IRunner, error) {
	return &DocMkDocsRunner{}, nil
}

func (*DocMkDocsRunner) ID() runner.RegisterID {
	return DocMkDocsRunnerID
}

func (*DocMkDocsRunner) Run(ctx runner.IContext) error {
	log := ctx.Log()
	comp := ctx.Component()

	config := comp.Config()
	log.Info("Starting mkdocs build documentation.", "component", config.Name)

	venv := comp.RelPath(".venv")
	cmdCtx := python.NewVEnvCtxBuilder(venv,
		[]string{
			"UV_PROJECT_ENVIRONMENT=" + venv,
			"VIRTUAL_ENV=" + venv,
		}).
		Cwd(comp.Root()).Build()

	log.Info("Creating python venv.", "path", venv)
	if !fs.Exists(venv) {
		err := cmdCtx.Check("uv", "sync")
		if err != nil {
			return err
		}
	}

	out := comp.OutBuildDocsDir()

	log.Info("Starting mkdocs build.")
	err := cmdCtx.Chain().
		Check("uv", "run", "mkdocs", "build", "--site-dir", out).
		Error()

	if err != nil {
		return err
	}

	log.Info("Built mkdocs documentation. Success.", "output", out)

	return nil
}
