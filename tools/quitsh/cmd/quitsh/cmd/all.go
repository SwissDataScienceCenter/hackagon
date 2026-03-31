package cmd

import (
	// cnBuildCmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/build"
	// cnFormatCmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/format"
	// cnImageCmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/image"
	// cnLintCmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/lint"
	// cnNix "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/nix"
	// cnSetupCmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/setup"
	// cnTestCmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/test"
	// "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/config"
	//
	// "github.com/sdsc-ordes/quitsh/pkg/cli"
	// cleanCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/clean"
	// configCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/config"
	// execRunnerCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/exec-runner"
	// execTargetCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/exec-target"
	// listCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/list"
	// proccompCmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/process-compose"
	// versionupcmd "github.com/sdsc-ordes/quitsh/pkg/cli/cmd/version-up"
)

func AddCommands(cl cli.ICLI, conf *config.Config) {
	// // Commands from Quitsh
	// configCmd.AddCmd(cl.RootCmd(), conf)
	//
	// execRunnerCmd.AddCmd(cl, cl.RootCmd(), &conf.Commands.DispatchArgs)
	// execTargetCmd.AddCmd(cl, cl.RootCmd(), &conf.Commands.ExecArgs)
	// listCmd.AddCmd(cl, cl.RootCmd())
	// cleanCmd.AddCmd(cl)
	// proccompCmd.AddCmd(cl, cl.RootCmd(), conf.Nix.FlakeDirRel)
	// versionupcmd.AddCmd(cl, cl.RootCmd())
	//
	// // Own customized commands.
	// cnSetupCmd.AddCmd(cl.RootCmd(), &conf.Nix)
	//
	// cnBuildCmd.AddCmd(cl, &conf.Build, &conf.Commands.ExecArgs)
	// cnLintCmd.AddCmd(cl, &conf.Lint, &conf.Commands.ExecArgs)
	// cnTestCmd.AddCmd(cl, &conf.Test, &conf.Commands.ExecArgs)
	// cnImageCmd.AddCmd(cl, &conf.Image, &conf.Commands.ExecArgs)
	// cnManifestCmd.AddCmd(cl, &conf.Manifest, &conf.Image, &conf.Commands.ExecArgs)
	//
	// cnNix.AddCmd(cl, &conf.Nix)
	// cnKindCmd.AddCmd(cl)
	// cnContainerCmd.AddCmd(cl.RootCmd())
	//
	// cnRegistryCmd.AddCmd(cl.RootCmd())
	// cnCICmd.AddCmd(cl, &conf.CI, &conf.Nix, nil)
	// cnFormatCmd.AddCmd(cl.RootCmd(), &conf.Nix)
}
