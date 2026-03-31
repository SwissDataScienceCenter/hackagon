//go:build test && integration

package test

import (
	"fmt"
	"os"
	"path"
	"testing"

	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/exec/git"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setup(t *testing.T) (ciTool *exec.CmdContext) {

	outputDir := os.Getenv("QUITSH_BIN_DIR")
	require.DirExists(t, outputDir)

	covDir := os.Getenv("QUITSH_COVERAGE_DIR")
	require.DirExists(t, covDir)

	ciToolExe := path.Join(outputDir, "quitsh")
	require.FileExists(t, ciToolExe)

	ciTool = exec.NewCmdCtxBuilder().
		BaseCmd(ciToolExe).
		Cwd(".").
		EnableCaptureError().
		Env(os.Environ()...).
		Env("GOCOVERDIR=" + covDir).
		Build()

	return
}

func TestCLIGeneratePipeline(t *testing.T) {
	ciTool := setup(t)
	temp := t.TempDir()
	file := path.Join(temp, "output.yaml")

	for _, s := range []string{"branch"} {
		pipfile := fs.MakeAbsolute(
			fmt.Sprintf("./data/generate-pipeline/pipeline-settings-%s.yaml", s),
		)

		_, repoRoot, err := git.NewCtxAtRoot(".")
		require.NoError(t, err)

		out, err := ciTool.GetCombined(
			"-C", repoRoot,
			"ci",
			"generate-pipeline",
			"--pipeline-settings",
			pipfile,
			"--output", file,
		)
		assert.Contains(t, out, "Write pipeline file.")
		require.NoError(t, err)
	}
}
