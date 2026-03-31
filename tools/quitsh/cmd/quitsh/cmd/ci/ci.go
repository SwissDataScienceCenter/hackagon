package ci

import (
	"errors"

	cicoverage "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/ci/coverage"
	cigeneratejobs "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/ci/generate-jobs"
	cimerge "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/ci/merge"
	citriggermrs "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/ci/trigger-merge-requests"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/config"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/custodian/pipeline"
	configR "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/cli"

	"github.com/spf13/cobra"
)

// AddCmd adds the `ci` subcommands to `root`.
func AddCmd(cl cli.ICLI,
	ciSetts *config.CISettings,
	nixSetts *configR.NixSettings,
	generateJobs pipeline.GenerateFunc) {
	ciCmd := &cobra.Command{
		Use:   "ci",
		Short: "Helper commands for CI. ",
		RunE: func(cmd *cobra.Command, _args []string) error {
			_ = cmd.Help()

			return errors.New("no command given")
		},
	}

	if generateJobs == nil {
		generateJobs = pipeline.Generate
	}

	cimerge.AddCmd(ciCmd)
	cigeneratejobs.AddCmd(cl, ciCmd, ciSetts, generateJobs)
	citriggermrs.AddCmd(ciCmd)
	cicoverage.AddCmd(cl, ciCmd, nixSetts)

	cl.RootCmd().AddCommand(ciCmd)
}
