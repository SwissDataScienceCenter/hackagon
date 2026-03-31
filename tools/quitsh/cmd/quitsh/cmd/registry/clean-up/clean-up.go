package regcleanup

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	cnGitlab "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/custodian/gitlab"

	"github.com/goccy/go-yaml"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/registry"

	"deedles.dev/xiter"
	gitlab "gitlab.com/gitlab-org/api/client-go"

	"github.com/go-playground/validator/v10"
	"github.com/spf13/cobra"
)

const longDescCleanup = `
Clean up the registry.
`

type (
	IncludeRe []pattern
	ExcludeRe []pattern

	Client   = gitlab.Client
	Tag      = gitlab.RegistryRepositoryTag
	Repo     = gitlab.RegistryRepository
	Response = gitlab.Response

	RepoData struct {
		ID        int
		Location  string
		CreatedAt string

		TagsCount int

		TagsMatched     []*Tag
		TagsMatchedName []string
	}

	ImageData struct {
		Ref string `yaml:"ref"`

		Digest    string    `yaml:"digest"`
		CreatedAt time.Time `yaml:"createdAt"`
	}

	PatternConfig struct {
		Includes []string `yaml:"includeRegexes"`
		Excludes []string `yaml:"excludeRegexes"`
	}

	pattern struct {
		full *regexp.Regexp

		// This is only the pattern part for the repository.
		repo *regexp.Regexp

		hasTagPattern bool
	}

	GatherSetts struct {
		ProjectID int `validate:"required"`

		RegistryType registry.Type
		Patterns     PatternConfig

		TokenEnv string
	}

	cleanUpSetts struct {
		GatherSetts
		Force bool
	}
)

func AddCmd(root *cobra.Command) {
	var setts cleanUpSetts

	ciCmd := &cobra.Command{
		Use:   "image-cleanup",
		Short: "Clean up the container registry.",
		Long:  longDescCleanup,
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return runCleanUp(&setts)
		},
	}

	hint := "They get first matched against registry urls (`registry.gitlab.com/organization/project/bla`)\n" +
		"in which case the whole repository is delete."

	ciCmd.Flags().
		StringArrayVarP(&setts.Patterns.Excludes,
			"exclude-regexes",
			"e",
			nil,
			"Regex patterns to match images to not delete.\n"+hint,
		)

	ciCmd.Flags().
		StringArrayVarP(&setts.Patterns.Includes,
			"include-regexes",
			"i",
			nil,
			"Regex patterns to match images to delete.",
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
		BoolVar(&setts.Force,
			"force", false,
			"Enabling this does not do a dry-run and exit but actually cleans up.",
		)

	ciCmd.Flags().
		StringVar(&setts.TokenEnv,
			"credential-token-env", "",
			"The token environment variable for the registry to upload the image.")

	root.AddCommand(ciCmd)
}

func (d *RepoData) Refs() (refs []*ImageData) {
	for i := range d.TagsMatchedName {
		refs = append(refs,
			&ImageData{
				Ref:       fmt.Sprintf("%s:%s", d.Location, d.TagsMatched[i].Name),
				Digest:    d.TagsMatched[i].Digest,
				CreatedAt: *d.TagsMatched[i].CreatedAt,
			})
	}

	slices.SortFunc(refs, func(a *ImageData, b *ImageData) int {
		return a.CreatedAt.Compare(b.CreatedAt)
	})

	return
}

func compileRegexes(
	includes []string,
	excludes []string,
) (IncludeRe, ExcludeRe, error) {
	var incls IncludeRe
	var excls ExcludeRe

	compileRe := func(s string) (*regexp.Regexp, error) {
		// Match always from the start to end!
		if !strings.HasPrefix(s, "^") {
			s = "^" + s
		}
		if !strings.HasSuffix(s, "$") {
			s += "$"
		}
		r, e := regexp.Compile(s)
		if e != nil {
			return nil, errors.AddContext(e, "regex '%s' does not compile", r.String())
		}

		return r, nil
	}

	split := func(s string) (repo, full *regexp.Regexp, hasTag bool, err error) {
		full, e := compileRe(s)
		err = errors.Combine(err, e)

		colon := strings.LastIndex(s, ":")
		hasTag = colon >= 0

		// if we dont have a ":" take everything as its repo pattern.
		if colon < 0 {
			colon = len(s)
		}
		log.Debug("Compile repo regex.", "re", s[0:colon])
		repo, e = compileRe(s[0:colon])
		err = errors.Combine(err, e)

		return
	}

	for i := range includes {
		repo, full, hasTag, err := split(includes[i])
		if err != nil {
			return nil, nil, err
		}
		incls = append(incls, pattern{repo: repo, full: full, hasTagPattern: hasTag})
	}

	for i := range excludes {
		repo, full, hasTag, err := split(excludes[i])
		if err != nil {
			return nil, nil, err
		}
		excls = append(excls, pattern{repo: repo, full: full, hasTagPattern: hasTag})
	}

	return incls, excls, nil
}

func runCleanUp(setts *cleanUpSetts) error {
	err := validator.New().Struct(setts)
	if err != nil {
		return err
	}

	git, err := cnGitlab.NewClient(setts.TokenEnv)
	if err != nil {
		return err
	}

	data, err := GatherData(&setts.GatherSetts, git, false)

	return deleteImages(data, setts, git, err)
}

//nolint:gocognit
func GatherData(setts *GatherSetts, git *gitlab.Client, withTagDetails bool) ([]RepoData, error) {
	log.Info("Getting all repositories in project")

	log.Info("Regex Patterns",
		"includes", setts.Patterns.Includes,
		"excludes", setts.Patterns.Excludes)
	incls, excls, err := compileRegexes(setts.Patterns.Includes, setts.Patterns.Excludes)
	if err != nil {
		return nil, err
	}

	get := func(opt *gitlab.ListRegistryRepositoriesOptions) (
		[]*Repo, *Response, error) {
		return git.ContainerRegistry.ListProjectRegistryRepositories(setts.ProjectID, opt)
	}

	opt := &gitlab.ListRegistryRepositoriesOptions{} //nolint:exhaustruct
	repos, err := cnGitlab.CollectAll(get, opt, &opt.ListOptions)
	if err != nil {
		return nil, errors.AddContext(
			err,
			"could not get container repositories for project id '%v'",
			setts.ProjectID,
		)
	}

	// Filter non-delete scheduled repositories.
	repos = slices.Collect(
		xiter.Filter(slices.Values(repos), func(r *Repo) bool {
			if r.Status == nil {
				return true
			}

			return *r.Status != gitlab.ContainerRegistryStatusDeleteScheduled &&
				*r.Status != gitlab.ContainerRegistryStatusDeleteOngoing
		}),
	)

	log.Info("Repositories:", "count", len(repos))

	repos = filter(
		repos,
		incls,
		excls,
		func(r *Repo) string { return r.Location },
		true,
	)

	log.Info("Repositories filtered:", "count", len(repos))

	data := []RepoData{}
	for i := range repos {
		d := RepoData{ //nolint:exhaustruct
			ID:        repos[i].ID,
			Location:  repos[i].Location,
			CreatedAt: repos[i].CreatedAt.String(),
		}

		get := func(opt *gitlab.ListRegistryRepositoryTagsOptions) (
			[]*Tag, *Response, error) {
			return git.ContainerRegistry.ListRegistryRepositoryTags(setts.ProjectID, d.ID, opt)
		}

		opt := &gitlab.ListRegistryRepositoryTagsOptions{} //nolint:exhaustruct
		refs, e := cnGitlab.CollectAll(get, opt, (*gitlab.ListOptions)(opt))
		if e != nil {
			return nil, errors.AddContext(
				e,
				"could not get all tags in container repositories '%s' for project id '%v'",
				d.Location,
				setts.ProjectID,
			)
		}

		d.TagsCount = len(refs)
		if d.TagsCount == 0 {
			log.Debug("Repository contains not tags. Skip.", "location", d.Location)
		} else {
			d.TagsMatched = filter(
				refs,
				incls,
				excls,
				func(t *Tag) string {
					return t.Location
				},
				false,
			)

			d.TagsMatchedName = slices.Collect(
				xiter.Map(slices.Values(d.TagsMatched), func(t *Tag) string { return t.Name }),
			)
			log.Debug("Repository tags to delete.", "tags", d.TagsMatchedName)
		}

		data = append(data, d)
	}

	if withTagDetails {
		var wg sync.WaitGroup
		var mu sync.Mutex

		var allErr error
		for i := range data {
			r := &data[i]

			for _, t := range r.TagsMatched {
				wg.Add(1)
				go func() {
					defer wg.Done()
					details, _, e := git.ContainerRegistry.GetRegistryRepositoryTagDetail(
						setts.ProjectID,
						r.ID,
						t.Name,
					)
					if e != nil {
						mu.Lock()
						allErr = errors.Combine(allErr, e)
						mu.Unlock()
					}

					*t = *details
				}()
			}
		}

		wg.Wait()
		if allErr != nil {
			return nil, allErr
		}
	}

	return data, nil
}

func formatRepoData(d []RepoData) string {
	s, e := yaml.Marshal(d)
	if e != nil {
		log.PanicE(e, "Could not marshal repo data.")
	}

	return string(s)
}

func deleteImages(data []RepoData, setts *cleanUpSetts, git *gitlab.Client, err error) error {
	var reposToDelete []RepoData
	var tagsToDelete []RepoData

	for _, d := range data {
		if d.TagsCount == 0 || len(d.TagsMatchedName) == d.TagsCount {
			d.TagsMatchedName = nil
			reposToDelete = append(reposToDelete, d)
		} else if len(d.TagsMatchedName) != 0 {
			tagsToDelete = append(tagsToDelete, d)
		}
	}

	if setts.Force {
		log.Info("Going to FULLY delete repositories:", "repos", formatRepoData(reposToDelete))

		e := deleteRepos(setts, git, reposToDelete)
		err = errors.Combine(err, e)
	} else {
		log.Info("[Dry Run] Would fully delete the following repositories:", "repos", formatRepoData(reposToDelete))
	}

	if setts.Force {
		log.Info("Going to delete tags in repositories:", "repos", formatRepoData(tagsToDelete))

		e := deleteTags(setts, git, tagsToDelete)
		err = errors.Combine(err, e)
	} else {
		log.Info("[Dry Run] Would delete tags in repositories:", "repos", formatRepoData(tagsToDelete))
	}

	return err
}

func deleteTags(setts *cleanUpSetts, git *gitlab.Client, repos []RepoData) (err error) {
	if !setts.Force {
		log.Info("[Dry Run] Use '--force' to delete this matches.")

		return nil
	}

	log.Info("Batch delete tags in repositories.", "count", len(repos))

	deleteTags := func(repo *RepoData) {
		var wg sync.WaitGroup
		var mu sync.Mutex

		for _, tag := range repo.TagsMatchedName {
			wg.Add(1)

			go func() {
				defer wg.Done()
				resp, e := git.ContainerRegistry.DeleteRegistryRepositoryTag(
					setts.ProjectID,
					repo.ID,
					tag,
				)

				if e != nil || !cnGitlab.ResponseOk(resp.Response) {
					e = errors.AddContext(e,
						"could not delete tag '%s' (repo: '%v', id: '%v'), response: '%s'",
						tag,
						repo.Location,
						repo.ID,
						resp.Status)
					mu.Lock()
					err = errors.Combine(err, e)
					mu.Unlock()
				}
			}()
		}

		wg.Wait()
	}

	for _, repo := range repos {
		log.Info("Deleting repository tags.", "location", repo.Location, "repo", repo)
		deleteTags(&repo)
	}

	return
}

func deleteRepos(setts *cleanUpSetts, git *gitlab.Client, repos []RepoData) (err error) {
	if !setts.Force {
		log.Info("[Dry Run] Use '--force' to delete this matches.")

		return nil
	}

	log.Info("Batch delete repositories.", "count", len(repos))
	for _, repo := range repos {
		log.Info("Deleting repository", "location", repo.Location, "repo", repo)

		resp, e := git.ContainerRegistry.DeleteRegistryRepository(setts.ProjectID, repo.ID)
		if e != nil || !cnGitlab.ResponseOk(resp.Response) {
			return errors.Combine(
				e,
				errors.New("could not delete repository '%s' (id: '%v'), response: '%s'",
					repo.Location,
					repo.ID,
					resp.Status),
			)
		}
	}

	return
}

// filter filters `refs` by include and exclude patterns.
//
//nolint:gocognit
func filter[T any](
	refs []T,
	incls IncludeRe,
	excls ExcludeRe,
	key func(T) string,
	onlyRepo bool,
) (res []T) {
	getRe := func(p pattern) *regexp.Regexp {
		if onlyRepo {
			return p.repo
		} else {
			return p.full
		}
	}

	for i := range refs {
		include := false
		exclude := false

		k := key(refs[i])

		for _, r := range incls {
			if getRe(r).MatchString(k) {
				include = true

				break
			}
		}

		for _, r := range excls {
			if onlyRepo && r.hasTagPattern {
				// If the exclude pattern has an additional tag pattern it
				// should not count as exclude already.
				// but later.
				continue
			}

			if getRe(r).MatchString(k) {
				exclude = true

				break
			}
		}

		if include && !exclude {
			res = append(res, refs[i])
		}
	}

	return res
}
