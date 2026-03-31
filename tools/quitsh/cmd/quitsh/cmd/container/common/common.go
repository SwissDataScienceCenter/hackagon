package common

import (
	"os"

	"github.com/sdsc-ordes/quitsh/pkg/exec"
	containermgr "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/exec/container-mgr"
)

func ContainerMgr() (exec.CmdContextBuilder, containermgr.Type, error) {
	mgr := os.Getenv("CONTAINER_MGR")
	if mgr == "" {
		mgr = containermgr.Podman.String()
	}

	t, err := containermgr.NewType(mgr)
	if err != nil {
		return exec.CmdContextBuilder{}, t, err
	}

	mgrCtx := containermgr.NewCmdCtxBuilder(t)

	return mgrCtx, t, nil
}
