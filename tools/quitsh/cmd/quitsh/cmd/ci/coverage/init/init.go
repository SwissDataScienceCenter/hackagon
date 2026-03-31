package cicoverageinit

import (
	"path"

	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/exec/git"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	nixtoolchain "github.com/sdsc-ordes/quitsh/pkg/toolchain/nix"
	"github.com/spf13/cobra"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/coverage"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"
)

func AddCmd(root *cobra.Command, nixSetts *config.NixSettings) {
	info := coverage.NewCoverageInfo()

	uploadCmd := &cobra.Command{
		Use:   "init",
		Short: "Initialize codecov: create a commit and report.",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return runInit(&info, nixSetts.FlakeDirRel)
		},
	}

	uploadCmd.Flags().
		StringVar(&info.TokenEnv,
			"codecov-token-env", info.TokenEnv,
			"Env. variable containing the codecov token to upload the coverage.")

	uploadCmd.Flags().
		StringVar(&info.ConfigFile, "codecov-config", info.ConfigFile,
			"Codecov config file to use, rel. paths are rel. to the Git root.")

	root.AddCommand(uploadCmd)
}

func runInit(
	info *coverage.CoverageToolInfo,
	flakeDirRel string,
) error {
	_, repoRoot, err := git.NewCtxAtRoot(".")
	if err != nil {
		return err
	}

	codecovCtx := nixtoolchain.WrapOverToolchain(
		exec.NewCmdCtxBuilder().
			Cwd(repoRoot).
			BaseCmd("codecov").
			CredentialFilter(nil),
		repoRoot,
		path.Join(repoRoot, flakeDirRel),
		"coverage-upload").Build()

	gitctx := git.NewCtx("")
	info.CommitSHA, err = gitctx.CurrentRev()
	if err != nil {
		return err
	}

	return coverage.InitCoverageCodecov(
		log.Global(),
		codecovCtx,
		info)
}
