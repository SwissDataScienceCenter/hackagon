package citriggermrs

import (
	"github.com/go-playground/validator/v10"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/spf13/cobra"
	gitlab "gitlab.com/gitlab-org/api/client-go"

	cnGitlab "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/custodian/gitlab"
)

const longDescMerge = `
Merge-requests are not automatically triggered by Gitlab
(if you dont have the merge result feature).
Thats why we do it here automatically over the Gitlab API.
`

type (
	Client       = gitlab.Client
	Response     = gitlab.Response
	MergeRequest = gitlab.MergeRequest

	triggerSettings struct {
		ProjectID int `validate:"required"`

		TokenEnv string

		Force bool
	}
)

func AddCmd(parent *cobra.Command) {
	var setts triggerSettings

	ciCmd := &cobra.Command{
		Use:   "trigger-merge-requests",
		Short: "Trigger all merge requests.",
		Long:  longDescMerge,
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return triggerMergeRequests(&setts)
		},
	}

	ciCmd.Flags().
		IntVar(&setts.ProjectID,
			"project-id",
			-1,
			"Project id (see gitlab.com).",
		)
	_ = ciCmd.MarkFlagRequired("project-id")

	ciCmd.Flags().
		BoolVar(&setts.Force,
			"force", false,
			"Really trigger the pipelines, instead of dry-running.",
		)
	ciCmd.Flags().
		StringVar(&setts.TokenEnv,
			"credential-token-env", "",
			"The token environment variable for the registry to upload the image.")

	parent.AddCommand(ciCmd)
}

func triggerMergeRequests(setts *triggerSettings) error {
	err := validator.New().Struct(setts)
	if err != nil {
		return err
	}

	git, err := cnGitlab.NewClient(setts.TokenEnv)
	if err != nil {
		return err
	}

	mrs, err := getMergeRequests(setts.ProjectID, git)
	if err != nil {
		return err
	}
	log.Info("Opened merge requests", "count", len(mrs))

	for i := range mrs {
		mr := mrs[i]

		if setts.Force {
			log.Info("Triggering pipeline for branch.", "title", mr.Title, "url", mr.WebURL)
		} else {
			log.Info("[Dry Run] Would trigger pipeline for branch.", "title", mr.Title, "url", mr.WebURL)

			continue
		}

		_, resp, e := git.MergeRequests.CreateMergeRequestPipeline(setts.ProjectID, mr.IID)

		if e != nil || !cnGitlab.ResponseOk(resp.Response) {
			err = errors.Combine(err,
				errors.AddContext(e, "Could not create pipeline."))
		}
	}

	return err
}

// getMergeRequests returns all open merge requests (no drafts).
func getMergeRequests(projectID int, git *Client) ([]*MergeRequest, error) {
	var opt gitlab.ListProjectMergeRequestsOptions

	opened := "opened"
	wip := "no"
	draft := false
	opt.State = &opened
	opt.Draft = &draft
	opt.WIP = &wip

	get := func(opt *gitlab.ListProjectMergeRequestsOptions) (
		[]*MergeRequest, *Response, error) {
		return git.MergeRequests.ListProjectMergeRequests(projectID, opt)
	}

	return cnGitlab.CollectAll(get, &opt, &opt.ListOptions)
}
