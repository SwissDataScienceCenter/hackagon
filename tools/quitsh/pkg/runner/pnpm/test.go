package nodepnpmrunner

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/exec/pnpm"

	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/debug"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/runner"
	"github.com/sdsc-ordes/quitsh/pkg/runner/config"
)

const NodePnpmTestRunnerID = "quitsh::test-node-pnpm"

type NodePnpmTestRunner struct {
	runnerConfig *RunnerConfigTest
	settings     config.ITestSettings
}

// NewNodePnpmTestRunner constructs a new NodePnpmTestRunner with its own config.
// It is accompanied by the Nix build-support function `buildNodePackage`.
func NewNodePnpmTestRunner(config any, settings config.ITestSettings) (runner.IRunner, error) {
	debug.Assert(config != nil, "config is nil")

	return &NodePnpmTestRunner{
		runnerConfig: common.Cast[*RunnerConfigTest](config),
		settings:     settings,
	}, nil
}

func (*NodePnpmTestRunner) ID() runner.RegisterID {
	return NodePnpmTestRunnerID
}

// Run tests a node project with `pnpm` with a tool (default `vitest`).
func (r *NodePnpmTestRunner) Run(ctx runner.IContext) error {
	log := ctx.Log()
	comp := ctx.Component()

	log.Info("Starting test for component.", "component", comp.Name())

	outDir := comp.OutBuildShareDir()
	coverageDataDir := comp.OutCoverageDataDir()

	builder := pnpm.NewCtxBuilder().
		Cwd(comp.Root()).
		// To control the out dir in the build process.
		Env("QUITSH_BUILD_DIR=" + outDir).
		Env("QUITSH_COVERAGE_DATA_DIR=" + coverageDataDir)

	pnpmCtx := builder.Build()

	log.Info("Run install & test.")

	testCmd, err := defineTestCmd(
		r.runnerConfig.Tool,
		r.runnerConfig.ToolArgs,
		true)
	if err != nil {
		return err
	}

	err = pnpmCtx.Check("install")
	if err != nil {
		return err
	}

	pnpmCtx = builder.Env(r.runnerConfig.ToolEnv...).Build()
	err = pnpmCtx.Check(testCmd...)
	if err != nil {
		log.ErrorE(err, "Test failed.")

		return err
	}

	return nil
}

func defineTestCmd(tool string, toolArgs []string, coverage bool) ([]string, error) {
	if tool != "vitest" {
		return nil, errors.New("Only 'vitest' is currently implemented.")
	}

	cmd := []string{"vitest", "run"}
	cmd = append(cmd, toolArgs...)
	if coverage {
		cmd = append(cmd, "--coverage")
	}

	return cmd, nil
}
