package containercmd

import (
	"errors"

	"github.com/spf13/cobra"
	copycmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/container/copy"
	mgrcmd "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/container/manager"
)

// AddCmd adds the `container` subcommands to `root`.
func AddCmd(root *cobra.Command) {
	regCmd := &cobra.Command{
		Use:   "container",
		Short: "Helper commands to operate with a container manager like 'docker' or 'podman'",
		RunE: func(cmd *cobra.Command, _args []string) error {
			_ = cmd.Help()

			return errors.New("no command given")
		},
	}

	mgrcmd.AddCmd(regCmd)
	copycmd.AddCmd(regCmd)

	root.AddCommand(regCmd)
}
