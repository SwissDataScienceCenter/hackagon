package lint

import (
	"errors"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/cli/general"
	"github.com/sdsc-ordes/quitsh/pkg/component/stage"
	"github.com/sdsc-ordes/quitsh/pkg/dag"
	"github.com/sdsc-ordes/quitsh/pkg/toolchain"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"

	"github.com/spf13/cobra"
)

const longDescLint = `
Lint a component matching them by name patterns (glob).
`

type lintArgs struct {
	compArgs general.ComponentArgs
}

func AddCmd(
	cli cli.ICLI,
	sett *config.LintSettings,
	execArgs *dag.ExecArgs,
) {
	var args lintArgs

	lintCmd := &cobra.Command{
		Use:   "lint",
		Short: "Lint components.",
		Long:  longDescLint,
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return runLint(cli, &args, execArgs)
		},
	}

	lintCmd.Flags().
		StringArrayVarP(&args.compArgs.ComponentPatterns,
			"components", "c", nil, "Components matched by these patterns are built.")
	lintCmd.Flags().
		StringVar(&args.compArgs.ComponentDir,
			"component-dir", "", "Directory pointing to a component to build, instead of giving them by patterns.")
	lintCmd.MarkFlagsMutuallyExclusive("components", "component-dir")
	lintCmd.MarkFlagsOneRequired("components", "component-dir")

	lintCmd.Flags().
		BoolVar(&sett.Fix, "fix", sett.Fix, "Try to fix all linting issues automatically.")

	cli.RootCmd().AddCommand(lintCmd)
}

func runLint(
	cl cli.ICLI,
	args *lintArgs,
	execArgs *dag.ExecArgs,
) error {
	comps, all, repoRoot, err := cl.FindComponents(&args.compArgs)
	if err != nil {
		return err
	}

	targets, prios, err := dag.DefineExecutionOrder(
		all, repoRoot,
		dag.WithTargetsByStageFromComponents(comps, stage.Stage("lint")),
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
		cl.RootDir(),
		cl.RootArgs().Parallel,
		dag.WithTags(execArgs.Tags...),
	)
}
