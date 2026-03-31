package reglist

import (
	"bytes"
	"io"
	"os"

	regcleanup "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/registry/clean-up"
	cnGitlab "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/custodian/gitlab"
	"gopkg.in/yaml.v3"

	"github.com/go-playground/validator/v10"
	"github.com/spf13/cobra"
)

func AddCmd(root *cobra.Command) {
	var setts regcleanup.GatherSetts

	ciCmd := &cobra.Command{
		Use:   "list-images",
		Short: "List images in the registry.",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return runList(&setts)
		},
	}

	ciCmd.Flags().
		StringArrayVarP(&setts.Patterns.Excludes,
			"exclude-regexes",
			"e",
			nil,
			"Regex patterns to match images to not list.\n",
		)

	ciCmd.Flags().
		StringArrayVarP(&setts.Patterns.Includes,
			"include-regexes",
			"i",
			nil,
			"Regex patterns to match images to list.",
		)

	ciCmd.Flags().
		IntVarP(&setts.ProjectID,
			"project-id",
			"p",
			-1,
			"Project id (see gitlab.com).",
		)
	_ = ciCmd.MarkFlagRequired("project-id")

	ciCmd.Flags().
		StringVar(&setts.TokenEnv,
			"credential-token-env", "",
			"The token environment variable for the registry to upload the image.")

	root.AddCommand(ciCmd)
}

func runList(setts *regcleanup.GatherSetts) error {
	err := validator.New().Struct(setts)
	if err != nil {
		return err
	}

	git, err := cnGitlab.NewClient(setts.TokenEnv)
	if err != nil {
		return err
	}

	data, err := regcleanup.GatherData(setts, git, true)
	if err != nil {
		return err
	}

	type repo struct {
		ID       int `yaml:"id"`
		Location string
		Images   []*regcleanup.ImageData
	}
	var repos []repo
	for i := range data {
		repos = append(
			repos,
			repo{ID: data[i].ID, Location: data[i].Location, Images: data[i].Refs()},
		)
	}
	y, err := yaml.Marshal(&repos)
	if err != nil {
		return err
	}
	_, err = io.Copy(os.Stdout, bytes.NewReader(y))
	if err != nil {
		return err
	}

	return nil
}
