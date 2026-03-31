package mgrcmd

import (
	"os"

	containercommon "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/container/common"

	"github.com/spf13/cobra"
)

func AddCmd(root *cobra.Command) {
	container := &cobra.Command{
		Use: "mgr",
		Short: "Run the container manager, either `docker` or `podman`. " +
			"The default is initialized form env. 'CONTAINER_MGR'",
		Args: cobra.ArbitraryArgs,
		RunE: func(_cmd *cobra.Command, args []string) error {
			return run(args)
		},
	}

	container.DisableFlagParsing = true

	root.AddCommand(container)
}

func run(args []string) error {
	b, _, err := containercommon.ContainerMgr()
	mgrCtx := b.Build()
	if err != nil {
		return err
	}

	return mgrCtx.WithStdin(os.Stdin).Check(args...)
}
