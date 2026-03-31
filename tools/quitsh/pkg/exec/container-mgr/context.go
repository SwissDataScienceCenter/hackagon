package containermgr

import (
	"runtime"

	"github.com/sdsc-ordes/quitsh/pkg/exec"
)

// Create a new container manager context builder
// (either `docker` or `podman`).
func NewCmdCtxBuilder(mgr Type) exec.CmdContextBuilder {
	b := exec.NewCmdCtxBuilder().BaseCmd(mgr.String())

	switch mgr {
	case Podman:
		return b
	case Docker:
		if UsesSudo(mgr) {
			b.PrependCommand("sudo")
		}

		return b
	}

	panic("unknown container manager")
}

// UsesSudo returns if the container manager uses `sudo`.
func UsesSudo(mgr Type) bool {
	switch mgr {
	case Podman:
		return false
	case Docker:
		return runtime.GOOS != "darwin" && runtime.GOOS != "windows"
	}

	return false
}
