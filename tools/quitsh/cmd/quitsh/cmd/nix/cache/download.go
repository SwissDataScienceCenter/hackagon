package cache

import (
	"path"
	"slices"
	"strings"

	"deedles.dev/xiter"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/exec/nix"
	"github.com/sdsc-ordes/quitsh/pkg/log"

	"github.com/spf13/cobra"
)

func AddDownloadCmd(cli cli.ICLI, parent *cobra.Command, nixSetts *config.NixSettings) {
	downloadCmd := &cobra.Command{
		Use:   "download",
		Short: "Download all flake outputs into the local Nix cache.",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return download(cli, nixSetts)
		},
	}

	parent.AddCommand(downloadCmd)
}

func download(cli cli.ICLI, nixSett *config.NixSettings) error {
	rootDir := cli.RootDir()
	flakePath := path.Join(rootDir, nixSett.FlakeDirRel)

	log.Infof("Downloading Flake outputs in '%v'.", flakePath)
	packages, err := nix.GetFlakeOutputs(rootDir, flakePath, []string{"devShells", "packages"})
	if err != nil {
		return err
	}

	log.Infof("Downloading '%v' Flake outputs.", len(packages))
	log.Info("Packages: \n" + formatPackage(packages))

	if nixSett.Cache.SSH.HostName == "" {
		return errors.New("Nix cache host name not set.")
	}

	switch {
	case nixSett.Cache.SSH.Enable:
		err = sshDownload(rootDir, packages, nixSett)
		if err != nil {
			return err
		}
	default:
		return errors.New("Only SSH is currently supported. Its not enabled.")
	}

	return nil
}

func sshDownload(rootDir string, packages []*nix.Package, nixSett *config.NixSettings) error {
	sshSett := &nixSett.Cache.SSH
	nixB, agent, err := sshSetup(rootDir, sshSett, false)
	if err != nil {
		return err
	}
	defer func() { _ = agent.Close() }()
	nixCtx := nixB.Build()

	url := sshSett.URL(false)
	copyCmd := make([]string, 0, len(packages)+3) //nolint:mnd
	copyCmd = append(copyCmd, "copy", "--from", url)

	ps := xiter.SortedFunc(slices.Values(packages), func(a *nix.Package, b *nix.Package) int {
		return strings.Compare(a.Name, b.Name)
	})

	for p := range ps {
		copyCmd = append(copyCmd, p.StorePath)
	}

	log.Infof("Downloading installables from '%v' to local cache...", url)

	err = nixCtx.Check(copyCmd...)
	if err != nil {
		log.Warnf("Some derivations could not be copied from the remote." +
			"Usually means that they are not in the remote store.")
	}

	return nil
}
