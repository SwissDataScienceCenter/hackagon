package kinddelete

import (
	"slices"
	"strings"

	"github.com/creasty/defaults"
	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	kindcreate "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/kind/create"
	containermgr "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/exec/container-mgr"

	"github.com/spf13/cobra"
)

func AddCmd(_cli cli.ICLI, parent *cobra.Command) {
	var sett kindcreate.Settings
	e := defaults.Set(&sett)
	log.PanicE(e, "Could set default values.")

	deleteCmd := &cobra.Command{
		Use:   "delete",
		Short: "Delete a kind kubernetes cluster with a local registry.",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return deleteKindCluster(&sett)
		},
	}

	deleteCmd.Flags().StringVarP(&sett.ClusterName, "cluster", "c",
		sett.ClusterName, "The cluster name to create.")

	deleteCmd.Flags().StringVarP(&sett.RegistryName, "registry", "r",
		sett.RegistryName, "The container registry name to use.")

	deleteCmd.Flags().Var(&sett.ContainerMgr, "container-mgr",
		"The container manager to use (docker, podman).")

	parent.AddCommand(deleteCmd)
}

// deleteKindCluster orchestrates commands from
// https://kind.sigs.k8s.io/docs/user/local-registry
func deleteKindCluster(sett *kindcreate.Settings) (err error) {
	err = kindcreate.DefineSettings(sett)
	if err != nil {
		return err
	}

	mgrCtx := containermgr.NewCmdCtxBuilder(sett.ContainerMgr).Build()

	b := exec.NewCmdCtxBuilder().
		BaseCmd("kind").
		Env("KIND_EXPERIMENTAL_PROVIDER=" + sett.ContainerMgr.String())
	if containermgr.UsesSudo(sett.ContainerMgr) {
		b.PrependCommand("sudo")
	}
	kindCtx := b.Build()

	running, _ := mgrCtx.Get("inspect", "--format", "{{.State.Running}}", sett.RegistryName)
	if running == "true" {
		err = mgrCtx.Check("rm", "-f", sett.RegistryName)
		if err != nil {
			return errors.AddContext(err,
				"could not stop registry '%v'", sett.RegistryName)
		}
	}

	log.Infof("Deleting Kind cluster '%v'...", sett.ClusterName)
	err = kindCtx.Check("delete", "-v", "5", "cluster", "--name", sett.ClusterName)
	if err != nil {
		return errors.AddContext(err,
			"could not delete kind cluster '%v'", sett.ClusterName)
	}

	ids, err := mgrCtx.GetSplit("container", "ls", "-a", "--format", "{{.ID}},{{.Networks}}")
	if err != nil {
		return err
	}

	for _, idLine := range ids {
		s := strings.Split(idLine, ",")

		if slices.Contains(s[1:], "kind") {
			log.Infof("Delete container '%s'.", s[0])

			err = mgrCtx.Check("rm", "-f", s[0])
			if err != nil {
				return errors.AddContext(err, "could not delete container '%v'", s[0])
			}
		}
	}

	nets, err := mgrCtx.GetSplit("network", "ls", "--format", "{{.Name}}")
	if err != nil {
		return err
	}
	if slices.Contains(nets, "kind") {
		log.Info("Removing network 'kind'.")
		err = mgrCtx.Check("network", "rm", "kind")
		if err != nil {
			return errors.AddContext(err, "could not delete network 'kind'")
		}
	}

	log.Infof("Successfully deleted cluster '%v'.", sett.ClusterName)

	return nil
}
