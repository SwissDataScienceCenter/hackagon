package cimerge

import (
	"fmt"
	"os"
	"strconv"

	cnCI "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/custodian/ci"

	"github.com/sdsc-ordes/quitsh/pkg/ci"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/exec/git"
	"github.com/sdsc-ordes/quitsh/pkg/log"

	"github.com/spf13/cobra"
)

const longDescMerge = `
On a MR, Gitlab Free (or other providers)
has no functionality for merged results pipelines,
therefore we merge the source branch into the target branch our-self.
`

const mergeBranch = "merged-temp"

func AddCmd(root *cobra.Command) {
	var targetBranch, targetCommitSHA string

	ciCmd := &cobra.Command{
		Use:   "merge-to-target-branch",
		Short: "Merge source branch to target branch on a merge-request.",
		Long:  longDescMerge,
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return runMergeTargetBranch(targetBranch, targetCommitSHA)
		},
	}

	ciCmd.Flags().StringVar(&targetBranch, "target-branch", "",
		"The target reference (if empty read from CI env. vars).")

	ciCmd.Flags().StringVar(&targetCommitSHA, "target-commit-sha", "",
		"The target commit SHA (if empty read from CI env. vars).")

	root.AddCommand(ciCmd)
}

func cleanUp(gitx git.Context) {
	_ = gitx.Check("branch", "-D", mergeBranch)
}

func runMergeTargetBranch(targetBranch, targetCommitSHA string) error {
	if !ci.IsRunning() {
		return errors.New("Not currently running in CI. Exit.")
	}

	gitx, _, err := git.NewCtxAtRoot(".")
	if err != nil {
		return err
	}

	err = ci.SetupGit(gitx, cnCI.CIUserName, cnCI.CIUserEmail)
	if err != nil {
		return err
	}

	defer cleanUp(gitx)

	sourceBranch := os.Getenv("CI_MERGE_REQUEST_SOURCE_BRANCH_NAME")
	if targetBranch == "" {
		targetBranch = os.Getenv("CI_MERGE_REQUEST_TARGET_BRANCH_NAME")
	}

	if targetBranch == "" || sourceBranch == "" {
		log.Info("Not on a merge request. Exit.")

		return nil
	}

	if targetCommitSHA == "" {
		targetCommitSHA, err = gitx.RemoteBranchExists("origin", targetBranch)
		if err != nil {
			return err
		}

		if targetCommitSHA == "" {
			return errors.AddContext(err,
				"could not determine commit SHA for '%v'", targetBranch)
		}
	}

	headSHA, err := gitx.Get("rev-parse", "HEAD")
	if err != nil {
		return err
	}
	log.Info("Merging source branch.", "from", headSHA, "to", targetBranch)

	err = fetchBranchesToCommonMergeBase(gitx, targetBranch, sourceBranch)
	if err != nil {
		return err
	}

	err = merge(gitx, targetBranch, targetCommitSHA, headSHA)
	if err != nil {
		return err
	}

	err = checkoutHead(gitx)
	if err != nil {
		return err
	}

	log.Info("Checked merge commit.", "commit", headSHA)

	return nil
}

func checkoutHead(gitx git.Context) error {
	headSHA, err := gitx.Get("rev-parse", "HEAD")
	if err != nil {
		return err
	}

	err = gitx.Check("checkout", headSHA)
	if err != nil {
		return err
	}

	return nil
}

func merge(gitx git.Context, targetBranch string, targetBranchSHA string, headSHA string) error {
	log.Info("Create branch.", "branch", mergeBranch, "at", targetBranch, "commit", targetBranchSHA)

	_ = gitx.Check("branch", "-D", mergeBranch)
	err := gitx.Check("branch", mergeBranch, targetBranchSHA)
	if err != nil {
		return err
	}

	log.Info("Checkout.", "branch", mergeBranch)
	err = gitx.Check("checkout", mergeBranch)
	if err != nil {
		return err
	}

	log.Info("Merge.", "sha", headSHA, "to", mergeBranch)
	err = gitx.Check("merge", "--no-ff", headSHA)
	if err != nil {
		unmergedFiles, _ := gitx.GetSplit("diff", "--name-only", "--diff-filter=U")

		log.Error("Either a merge error (see below) or unmerged files with conflicts.\n"+
			"You need to either rebase onto the target branch and resolve conflicts with:\n"+
			fmt.Sprintf(" - `git rebase -i '%s'`\n", targetBranch)+
			"or merge the target branch with:\n"+
			fmt.Sprintf(" - `git merge '%s'\n", targetBranch),
			"unmerged-files", unmergedFiles)

		return err
	}

	return nil
}

func fetchBranchesToCommonMergeBase(
	gitx git.Context,
	targetBranch string,
	sourceBranch string) error {
	depth := 10
	tries := 1

	targetBranchRemote := "refs/remotes/origin/" + targetBranch
	sourceBranchRemote := "refs/remotes/origin/" + sourceBranch

	for tries < 5 {
		log.Info("Fetching target branch with depth.", "branch", targetBranch, "depth", depth)
		err := gitx.Check(
			"fetch",
			"--force",
			"--depth",
			strconv.Itoa(depth),
			"origin",
			targetBranch+":"+targetBranchRemote,
		)
		if err != nil {
			return err
		}

		log.Info("Fetching source branch with depth.", "branch", sourceBranch, "depth", depth)
		err = gitx.Check(
			"fetch",
			"--force",
			"--depth",
			strconv.Itoa(depth),
			"origin",
			sourceBranch+":"+sourceBranchRemote,
		)
		if err != nil {
			return err
		}

		log.Info(
			"Checking for common merge base...",
			"targetBranch",
			targetBranchRemote,
			"sourceBranch",
			sourceBranchRemote,
		)

		commonBase, err := gitx.Get(
			"merge-base",
			targetBranchRemote,
			sourceBranchRemote,
		)

		if err == nil {
			log.Info("Found common merge base.", "base", commonBase)

			return nil
		} else {
			log.Info("Merge base not found, fetching more.")
		}

		depth *= 5
	}

	output, err := gitx.Get(
		"log",
		"--graph",
		"--oneline",
		"--color",
		targetBranchRemote,
		sourceBranchRemote,
	)
	if err != nil {
		log.Warn("could not get log between branches")
	} else {
		log.Info("Current log between target and source branch:", "log", "\n"+output)
	}

	return errors.New(
		"merge base between target '%v' and source '%v' branch not found (gave up)",
		targetBranch,
		sourceBranch,
	)
}
