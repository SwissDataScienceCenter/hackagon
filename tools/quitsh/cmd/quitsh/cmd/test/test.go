package test

import (
	"errors"
	"fmt"

	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/cli/general"
	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/component/stage"
	"github.com/sdsc-ordes/quitsh/pkg/dag"
	"github.com/sdsc-ordes/quitsh/pkg/toolchain"

	"github.com/spf13/cobra"
)

const longDescTest = `
Test a component matching them by name patterns (glob).
Forwarding arguments to the test utility is done with
'-- arg1 arg2...'
`

type lintTest struct {
	compArgs general.ComponentArgs
}

func AddCmd(
	cl cli.ICLI,
	testSettings *config.TestSettings,
	execArgs *dag.ExecArgs,
) {
	var lintArgs lintTest

	testCmd := &cobra.Command{
		Use:   "test [forwarded-args...]",
		Short: "Test components.",
		Long:  longDescTest,
		RunE: func(_cmd *cobra.Command, args []string) error {
			testSettings.TestArgs = append(testSettings.TestArgs, args...)

			return execute(cl, &lintArgs, execArgs)
		},
	}

	testCmd.Flags().
		StringArrayVarP(&lintArgs.compArgs.ComponentPatterns,
			"components", "c", nil, "Components matched by these patterns are built.")
	testCmd.Flags().
		StringVar(&lintArgs.compArgs.ComponentDir,
			"component-dir", "", "Directory pointing to a component to build, instead of giving them by patterns.")
	testCmd.Flags().
		VarP(&testSettings.BuildType,
			"build-type", "b",
			fmt.Sprintf("The build type (set by env. type if not set) (%v).", common.GetAllBuildTypes()),
		)
	testCmd.Flags().
		BoolVar(&testSettings.ShowTestLog,
			"show-test-log", testSettings.ShowTestLog,
			"Show the log of the tests.")

	testCmd.MarkFlagsMutuallyExclusive("components", "component-dir")
	testCmd.MarkFlagsOneRequired("components", "component-dir")

	cl.RootCmd().AddCommand(testCmd)
}

func execute(
	cl cli.ICLI,
	args *lintTest,
	execArgs *dag.ExecArgs,
) error {
	comps, all, rootDir, err := cl.FindComponents(&args.compArgs)
	if err != nil {
		return err
	}

	targets, prios, err := dag.DefineExecutionOrder(
		all,
		rootDir,
		dag.WithTargetsByStageFromComponents(comps, stage.Stage("test")),
	)

	if err != nil {
		return err
	} else if len(targets) == 0 {
		return errors.New("no targets selected")
	}

	var dispatcher toolchain.IDispatcher
	if !cl.RootArgs().SkipToolchainDispatch {
		dispatcher = cl.ToolchainDispatcher()
	}

	return dag.Execute(
		targets,
		prios,
		cl.RunnerFactory(),
		dispatcher,
		cl.Config(),
		rootDir,
		cl.RootArgs().Parallel,
		dag.WithTags(execArgs.Tags...),
	)
}
