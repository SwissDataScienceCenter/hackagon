package cmd

import (
	cnBuildCmd "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/build"
	cnFormatCmd "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/format"
	cnGenerateSchemaCmd "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/generate-schema"
	cnImageCmd "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/image"
	cnLintCmd "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/lint"
	cnNix "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/nix"
	cnSetupCmd "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/setup"
	cnTestCmd "github.com/swissdatasciencecenter/hackagon/tools/quitsh/cmd/quitsh/cmd/test"
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/config"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	cleanCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/clean"
	configCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/config"
	execRunnerCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/exec-runner"
	execTargetCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/exec-target"
	listCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/list"
	proccompCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/process-compose"
)

func AddCommands(cl cli.ICLI, conf *config.Config) {
	// Commands from Quitsh
	configCmd.AddCmd(cl.RootCmd(), conf)

	execRunnerCmd.AddCmd(cl, cl.RootCmd(), &conf.Commands.DispatchArgs)
	execTargetCmd.AddCmd(cl, cl.RootCmd(), &conf.Commands.ExecArgs)
	listCmd.AddCmd(cl, cl.RootCmd())
	cleanCmd.AddCmd(cl)
	proccompCmd.AddCmd(cl, cl.RootCmd(), conf.Nix.FlakeDirRel)

	// Own customized commands.
	cnSetupCmd.AddCmd(cl.RootCmd(), &conf.Nix)

	cnBuildCmd.AddCmd(cl, &conf.Build, &conf.Commands.ExecArgs)
	cnLintCmd.AddCmd(cl, &conf.Lint, &conf.Commands.ExecArgs)
	cnTestCmd.AddCmd(cl, &conf.Test, &conf.Commands.ExecArgs)
	cnImageCmd.AddCmd(cl, &conf.Image, &conf.Commands.ExecArgs)

	cnNix.AddCmd(cl, &conf.Nix)
	cnFormatCmd.AddCmd(cl.RootCmd(), &conf.Nix)
	cnGenerateSchemaCmd.AddCmd(cl.RootCmd())
}
