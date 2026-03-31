package registry

import (
	"errors"

	regcleanup "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/registry/clean-up"
	reglist "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/registry/list"

	"github.com/spf13/cobra"
)

// AddCmd adds the `registry` subcommands to `root`.
func AddCmd(root *cobra.Command) {
	regCmd := &cobra.Command{
		Use:   "registry",
		Short: "Helper commands for the registry. ",
		RunE: func(cmd *cobra.Command, _args []string) error {
			_ = cmd.Help()

			return errors.New("no command given")
		},
	}

	regcleanup.AddCmd(regCmd)
	reglist.AddCmd(regCmd)

	root.AddCommand(regCmd)
}
