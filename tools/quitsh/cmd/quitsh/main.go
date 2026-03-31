package main

import (
	"os"

	cnCmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/build"
	cnConfig "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/config"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/exec/nix"

	// cnRunner "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/config"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/toolchain"
)

func main() {
	err := log.Setup("info") // Level will be set at startup.
	if err != nil {
		log.PanicE(err, "Could not setup logger.")
	}

	args := cnConfig.New()

	cli, err := cli.New(
		&args.Commands.Root,
		&args,
		cli.WithName("quitsh"),
		cli.WithVersion(build.Version()),
		cli.WithStages(
			"lint",
			"build",
			"test",
			"image",
			"deploy",
			"aux"),
		cli.WithTargetToStageMapperDefault(),
		cli.WithToolchainDispatcherNix(
			nix.DefaultFlakeDirRel,
			func(c config.IConfig) *toolchain.DispatchArgs {
				cc := common.Cast[*cnConfig.Config](c)

				return &cc.Commands.DispatchArgs
			},
		),
	)
	if err != nil {
		log.PanicE(err, "Could not initialize CLI app.")
	}

	// Enhance the CLI with our commands and runners.
	cnCmd.AddCommands(cli, &args)
	// cnRunner.RegisterAll(
	// 	&args.Build,
	// 	&args.Lint,
	// 	&args.Test,
	// 	&args.Image,
	// 	&args.Manifest,
	// 	&args.Nix,
	// 	cli.RunnerFactory())

	// Run the app.
	err = cli.Run()
	if err != nil {
		log.ErrorE(err, "Error occurred.")
		os.Exit(1)
	}
}
