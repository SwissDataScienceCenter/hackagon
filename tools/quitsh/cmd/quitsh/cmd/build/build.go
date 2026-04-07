package build

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
	"github.com/spf13/pflag"
)

const longDescBuild = `
Build a component matching them by name patterns (glob).
`

type buildArgs struct {
	compArgs general.ComponentArgs
}

func AddCmd(
	cl cli.ICLI,
	buildSettings *config.BuildSettings,
	execArgs *dag.ExecArgs,
) {
	var args buildArgs

	buildCmd := &cobra.Command{
		Use:   "build",
		Short: "Build components.",
		Long:  longDescBuild,
		RunE: func(cmd *cobra.Command, _args []string) error {
			return execute(cl, cmd, &args, buildSettings, execArgs)
		},
	}

	buildCmd.Flags().
		VarP(&buildSettings.BuildType,
			"build-type", "b",
			fmt.Sprintf("The build type (set by env. type if not set) (%v).", common.GetAllBuildTypes()),
		)
	buildCmd.Flags().
		VarP(&buildSettings.EnvironmentType,
			"env-type", "e", fmt.Sprintf("The environment type. (%s)", common.GetEnvTypesHelp()))

	buildCmd.Flags().
		BoolVar(&buildSettings.Coverage,
			"coverage", false, "Enable coverage for the build.")

	buildCmd.Flags().
		StringArrayVarP(&args.compArgs.ComponentPatterns,
			"components", "c", nil, "Components matched by these patterns are built.")
	buildCmd.Flags().
		StringVar(&args.compArgs.ComponentDir,
			"component-dir", "", "Directory pointing to a component to build, instead of giving them by patterns.")

	buildCmd.MarkFlagsMutuallyExclusive("components", "component-dir")
	buildCmd.MarkFlagsOneRequired("components", "component-dir")

	cl.RootCmd().AddCommand(buildCmd)
}

func adjustDefaultValues(cmd *cobra.Command, setts *config.BuildSettings) {
	// Adjust the `BuildType` if its not set.
	cmd.Flags().VisitAll(func(flag *pflag.Flag) {
		if flag.Name == "build-type" && !flag.Changed {
			setts.BuildType = common.NewBuildTypeFromEnv(setts.EnvironmentType)
		}
	})
}

func execute(
	cl cli.ICLI,
	cmd *cobra.Command,
	args *buildArgs,
	buildSettings *config.BuildSettings,
	execArgs *dag.ExecArgs,
) error {
	adjustDefaultValues(cmd, buildSettings)

	comps, all, rootDir, err := cl.FindComponents(&args.compArgs)
	if err != nil {
		return err
	}

	targets, prios, err := dag.DefineExecutionOrder(
		all, rootDir,
		dag.WithTargetsByStageFromComponents(comps, stage.Stage("build")),
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
