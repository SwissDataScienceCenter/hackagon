package setup

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/config"
	setup "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/setup"

	"github.com/spf13/cobra"
)

func AddCmd(root *cobra.Command, nixSett *config.NixSettings) {
	setupCmd := &cobra.Command{
		Use:     "setup-development",
		Aliases: []string{"setup"},
		Short:   "Setup local development.",
		Long:    "Setup the repository for local development.",
		PreRunE: func(_cmd *cobra.Command, _args []string) error {
			return nil
		},
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return setup.Setup(nixSett.FlakeDirRel)
		},
	}

	root.AddCommand(setupCmd)
}
