package cicoverageupload

import (
	"path"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/cli/general"
	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/exec/git"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	nixtoolchain "github.com/sdsc-ordes/quitsh/pkg/toolchain/nix"
	"github.com/spf13/cobra"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/coverage"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"
)

type coverageArgs struct {
	compArgs general.ComponentArgs
}

func AddCmd(cli cli.ICLI, root *cobra.Command, nixSetts *config.NixSettings) {
	var args coverageArgs
	info := coverage.NewCoverageInfo()

	uploadCmd := &cobra.Command{
		Use:   "upload",
		Short: "Run codecov upload on certain components",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return runUpload(cli, &args, &info, nixSetts.FlakeDirRel)
		},
	}

	uploadCmd.Flags().
		StringArrayVarP(&args.compArgs.ComponentPatterns,
			"components", "c", nil,
			"Components matched by these patterns are built.")
	uploadCmd.Flags().
		StringVar(&args.compArgs.ComponentDir,
			"component-dir", "",
			"Directory pointing to a component to build, instead of giving them by patterns.")

	uploadCmd.Flags().
		StringVar(&info.TokenEnv,
			"codecov-token-env", info.TokenEnv,
			"Env. variable containing the codecov token to upload the coverage.")

	uploadCmd.Flags().
		StringVar(&info.ConfigFile, "codecov-config", info.ConfigFile,
			"Codecov config file to use, rel. paths are rel. to the Git root.")

	uploadCmd.Flags().
		BoolVar(&info.DryRun, "dry-run", info.DryRun,
			"Dry run the upload.")

	uploadCmd.Flags().
		StringArrayVarP(&info.Files, "file", "f", info.Files,
			"Override the files to upload (multiple possible).")

	uploadCmd.MarkFlagsMutuallyExclusive("components", "component-dir")
	uploadCmd.MarkFlagsOneRequired("components", "component-dir")

	root.AddCommand(uploadCmd)
}

func runUpload(
	cl cli.ICLI,
	args *coverageArgs,
	info *coverage.CoverageToolInfo,
	flakeDirRel string,
) error {
	comps, _, repoRoot, err := cl.FindComponents(&args.compArgs)
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

	for i := range comps {
		err = info.AddComponentDefaultFiles(comps[i])
		if err != nil {
			return err
		}
	}

	return coverage.UploadCoverageCodecov(
		log.Global(),
		codecovCtx,
		info)
}
