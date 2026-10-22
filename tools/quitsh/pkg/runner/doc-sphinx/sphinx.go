package docsphinxrunner

import (
	"github.com/sdsc-ordes/quitsh/pkg/exec/python"
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

	// Every run, not only when the venv is missing: a venv left over from an
	// older lock file would otherwise build with the wrong versions. `--locked`
	// fails when pyproject.toml and uv.lock disagree instead of rewriting the lock.
	log.Info("Syncing python venv.", "path", venv)
	err := cmdCtx.Check("uv", "sync", "--locked")
	if err != nil {
		return err
	}

	out := comp.OutBuildDocsDir()

	// `-W` makes any warning fail the build — a broken cross-reference is a
	// warning, and in docs it is a bug. `--keep-going` still reports all of them.
	log.Info("Starting sphinx build.")
	err = cmdCtx.Chain().
		Check("uv", "run", "sphinx-build", "-W", "--keep-going", "src", out).
		Error()

	if err != nil {
		return err
	}

	log.Info("Built sphinx documentation. Success.", "output", out)

	return nil
}
