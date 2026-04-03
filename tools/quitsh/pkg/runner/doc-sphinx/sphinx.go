package docsphinxrunner

import (
	"github.com/sdsc-ordes/quitsh/pkg/exec/python"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
)

const DocSphinxRunnerID = "hackagon::doc-sphinx"

type DocSphinxRunner struct{}

func NewSphinxBuildRunner() (runner.IRunner, error) {
	return &DocSphinxRunner{}, nil
}

func (*DocSphinxRunner) ID() runner.RegisterID {
	return DocSphinxRunnerID
}

func (*DocSphinxRunner) Run(ctx runner.IContext) error {
	log := ctx.Log()
	comp := ctx.Component()

	config := comp.Config()
	log.Info("Starting Sphinx build documentation.", "component", config.Name)

	venv := comp.RelPath(".venv")
	cmdCtx := python.NewVEnvCtxBuilder(venv,
		[]string{
			"UV_PROJECT_ENVIRONMENT=" + venv,
			"VIRTUAL_ENV=" + venv,
		}).
		Cwd(comp.Root()).Build()

	log.Info("Creating python venv.", "path", comp.Root())
	if !fs.Exists(venv) {
		err := cmdCtx.Check("uv", "sync")
		if err != nil {
			return err
		}
	}

	out := comp.OutBuildDocsDir()

	log.Info("Starting sphinx build.")
	err := cmdCtx.Chain().
		Check("uv", "run", "sphinx-build", "src", out).
		Error()

	if err != nil {
		return err
	}

	log.Info("Built sphinx documentation. Success.", "output", out)

	return nil
}
