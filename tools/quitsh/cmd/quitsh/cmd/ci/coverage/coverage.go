package cicoverage

import (
	"errors"

	cicoverageupload "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/ci/coverage/upload"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/spf13/cobra"
)

// AddCmd adds the `coverage` subcommands to `root`.
func AddCmd(cli cli.ICLI, root *cobra.Command, nixSetts *config.NixSettings) {
	coverageCmd := &cobra.Command{
		Use:   "coverage",
		Short: "Helper for coverage upload etc.",
		RunE: func(cmd *cobra.Command, _args []string) error {
			_ = cmd.Help()

			return errors.New("no command given")
		},
	}

	cicoverageupload.AddCmd(cli, coverageCmd, nixSetts)

	// TODO: This command is no more used and can be removed in the future.
	// See: https://github.com/codecov/codecov-cli/issues/696
	// cicoverageinit.AddCmd(coverageCmd)

	root.AddCommand(coverageCmd)
}
