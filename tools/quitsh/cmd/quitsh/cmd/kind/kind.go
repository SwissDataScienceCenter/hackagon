package kind

import (
	"errors"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	kindcreate "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/kind/create"
	kinddelete "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/kind/delete"

	"github.com/spf13/cobra"
)

// AddCmd adds the `ci` subcommands to `root`.
func AddCmd(cl cli.ICLI) {
	kindCmd := &cobra.Command{
		Use:   "kind",
		Short: "Helper around 'kind'.",
		RunE: func(cmd *cobra.Command, _args []string) error {
			_ = cmd.Help()

			return errors.New("no command given")
		},
	}

	kindcreate.AddCmd(cl, kindCmd)
	kinddelete.AddCmd(cl, kindCmd)

	cl.RootCmd().AddCommand(kindCmd)
}
