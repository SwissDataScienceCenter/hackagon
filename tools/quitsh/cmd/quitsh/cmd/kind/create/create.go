package kindcreate

import (
	"fmt"
	"os"
	"os/user"
	"path"
	"slices"
	"strings"

	"github.com/creasty/defaults"
	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	containermgr "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/exec/container-mgr"

	"github.com/spf13/cobra"
)

type (
	Settings struct {
		ClusterName string `default:"default"`

		RegistryVersion string `default:"3.0.0"`
		RegistryName    string `default:""`
		RegistryPort    int    `default:"5001"`

		ContainerMgr containermgr.Type `default:"0"`
	}
)

func AddCmd(_cli cli.ICLI, parent *cobra.Command) {
	var sett Settings
	e := defaults.Set(&sett)
	log.PanicE(e, "Could set default values.")

	createCmd := &cobra.Command{
		Use:   "create",
		Short: "Create a kind kubernetes cluster with a local registry.",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return createKindCluster(&sett)
		},
	}

	createCmd.Flags().StringVarP(&sett.ClusterName, "cluster", "c",
		sett.ClusterName, "The cluster name to create.")

	createCmd.Flags().IntVarP(&sett.RegistryPort, "registry-port", "p",
		sett.RegistryPort, "The registry port to use.")

	createCmd.Flags().Var(&sett.ContainerMgr, "container-mgr",
		"The container manager to use (docker, podman).")

	parent.AddCommand(createCmd)
}

func createCluster(
	sett *Settings,
	cmdCtx *exec.CmdContext,
	kindCtx *exec.CmdContext) (abort bool, err error) {
	clusters, err := kindCtx.GetSplit("get", "clusters")
	if err != nil {
		return false, err
	}

	if slices.Contains(clusters, sett.ClusterName) {
		log.Warnf("Cluster '%s' already exists, skip creating it.", sett.ClusterName)

		return true, nil
	}

	log.Info("Creating local kind kubernetes cluster.")
	clusterConfig := strings.NewReader(`
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
containerdConfigPatches:
- |-
  [plugins."io.containerd.grpc.v1.cri".registry]
    config_path = "/etc/containerd/certs.d"`)

	err = kindCtx.WithStdin(clusterConfig).Check(
		"create", "cluster",
		"--name", sett.ClusterName, "--config=-")
	if err != nil {
		return false, errors.AddContext(err,
			"could not create cluster '%s'", sett.ClusterName)
	}

	if containermgr.UsesSudo(sett.ContainerMgr) {
		//FIXME: Make kube config from root apply to the user.
		user, e := user.Current()
		if e != nil || user.HomeDir == "" {
			return false, errors.AddContext(e, "user home could not be retrieved")
		}

		config := path.Join(user.HomeDir, ".kube/config")
		log.Infof("Set permissions on '%s'.", config)
		e = cmdCtx.Check("sudo", "chown",
			"--reference="+user.HomeDir, config)
		if e != nil {
			return false, errors.AddContext(e, "could not set permission on '%v'", config)
		}
	}

	return false, nil
}

// createKindCluster orchestrates commands from
// https://kind.sigs.k8s.io/docs/user/local-registry.
//

func createKindCluster(sett *Settings) error {
	log.Info("Creating local kind kubernetes cluster.", "settings", *sett)

	err := DefineSettings(sett)
	if err != nil {
		return err
	}

	cmdCtx := exec.NewCommandCtx("")
	mgrCtx := containermgr.NewCmdCtxBuilder(sett.ContainerMgr).Build()

	b := exec.NewCmdCtxBuilder().
		BaseCmd("kind").
		Env("KIND_EXPERIMENTAL_PROVIDER=" + sett.ContainerMgr.String())

	if containermgr.UsesSudo(sett.ContainerMgr) {
		b.PrependCommand("sudo",
			"--preserve-env=HOME,KIND_EXPERIMENTAL_PROVIDER",
		)
		b.Env()
	}
	kindCtx := b.Build()

	// 1. Create registry container unless it already exists
	running, _ := mgrCtx.Get(
		"inspect", "--format", "{{.State.Running}}", sett.RegistryName)

	if running != "true" {
		log.Info("Create registry.")
		err = mgrCtx.Check(
			"run", "-d",
			"--restart=always",
			"-p", fmt.Sprintf("127.0.0.1:%v:5000", sett.RegistryPort),
			"--network=bridge",
			"--name", sett.RegistryName,
			fmt.Sprintf("docker.io/library/registry:%s", sett.RegistryVersion),
		)
		if err != nil {
			return errors.AddContext(err, "could not start registry")
		}
	} else {
		log.Infof("Registry '%v' is already running.", sett.RegistryName)
	}

	// 2. Create kind cluster with containerd registry config dir enabled
	// TODO: kind will eventually enable this by default and this patch will
	// be unnecessary.
	//
	// See:
	// https://github.com/kubernetes-sigs/kind/issues/2875
	// https://github.com/containerd/containerd/blob/main/docs/cri/config.md#registry-configuration
	// See: https://github.com/containerd/containerd/blob/main/docs/hosts.md
	abort, err := createCluster(sett, cmdCtx, kindCtx)
	if err != nil || abort {
		return err
	}

	// 3. Add the registry config to the nodes
	//
	// This is necessary because localhost resolves to loopback addresses that are
	// network-namespace local.
	// In other words: localhost in the container is not localhost on the host.
	//
	// We want a consistent name that works from both ends, so we tell containerd to
	// alias localhost:${reg_port} to the registry container when pulling images
	log.Infof(
		"Alias 'localhost:%v' to 'http://%s:5000' inside all nodes.",
		sett.RegistryPort, sett.ClusterName)

	regDir := fmt.Sprintf("/etc/containerd/certs.d/localhost:%v", sett.RegistryPort)
	regFile := path.Join(regDir, "hosts.toml")

	nodes, err := kindCtx.GetSplit("get", "nodes", "--name", sett.ClusterName)
	if err != nil {
		return errors.AddContext(err, "could not get cluster nodes")
	}
	for _, n := range nodes {
		err = mgrCtx.Check("exec", n, "mkdir", "-p", regDir)
		if err != nil {
			return errors.AddContext(err,
				"could not create dir in node '%s'", n)
		}

		r := strings.NewReader(
			fmt.Sprintf(`[host."http://%s:5000"]`, sett.RegistryName))
		err = mgrCtx.
			WithStdin(r).
			Check("exec", "-i", n, "cp", "/dev/stdin", regFile)
		if err != nil {
			return errors.AddContext(err, "could not add '%s' file on node", regFile)
		}
	}

	// 4. Connect the registry to the cluster network if not already connected
	// This allows kind to bootstrap the network but ensures they're on the same network
	log.Infof("Attach local registry '%s' to kind network.", sett.RegistryName)
	networkName, _ := mgrCtx.Get(
		"inspect",
		"-f",
		"{{json .NetworkSettings.Networks.kind}}",
		sett.RegistryName,
	)
	if networkName == "null" {
		err = mgrCtx.Check("network", "connect", "kind", sett.RegistryName)
		if err != nil {
			return err
		}
	}

	//nolint:lll
	// 5. Document the local registry
	// https://github.com/kubernetes/enhancements/tree/master/keps/sig-cluster-lifecycle/generic/1755-communicating-a-local-registry.
	log.Info("Document the local registry.")
	r := strings.NewReader(fmt.Sprintf(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:%v"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"`,
		sett.RegistryPort))

	err = cmdCtx.WithStdin(r).Check(
		"kubectl", "--context", "kind-"+sett.ClusterName,
		"apply", "-f", "-")
	if err != nil {
		return err
	}

	log.Infof("Successfully created cluster '%v'.", sett.ClusterName)

	return nil
}

func DefineSettings(sett *Settings) (err error) {
	sett.RegistryName = fmt.Sprintf("kind-%s-registry", sett.ClusterName)

	mgr := os.Getenv("CONTAINER_MGR")
	if mgr != "" {
		sett.ContainerMgr, err = containermgr.NewType(mgr)
		if err != nil {
			return err
		}

		return
	}

	mgr = os.Getenv("KIND_EXPERIMENTAL_PROVIDER")
	if mgr != "" {
		sett.ContainerMgr, err = containermgr.NewType(mgr)
		if err != nil {
			return err
		}

		return
	}

	return nil
}
