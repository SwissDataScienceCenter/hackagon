package generateversion

import (
	genver "github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/version"

	"github.com/sdsc-ordes/quitsh/pkg/cli/general"
	"github.com/sdsc-ordes/quitsh/pkg/component"
	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"

	"github.com/spf13/cobra"
)

const longDescVersion = `
Generate a 'version.<ext>' file which can be compiled into the executable.
By default if no version and language is given
these values are determined from the current component
searched from the working directory upwards and
`

type GenerateVersionData struct {
	Version     component.Version
	Language    string
	OutputDir   string
	PackageName string
}

func AddCmd(root *cobra.Command) {
	var genVersionArgs = GenerateVersionData{} //nolint:exhaustruct
	genVersionCmd := &cobra.Command{
		Use:   "generate-version",
		Short: "Generate a version file which is further compiled into the application.",
		Long:  longDescVersion,
		RunE: func(_ *cobra.Command, _args []string) error {
			return Execute(&genVersionArgs)
		},
	}

	genVersionCmd.Flags().
		Var(&genVersionArgs.Version,
			"version", "The sem. version to put into the 'version.<ext>' file.")

	genVersionCmd.Flags().
		StringVarP(&genVersionArgs.Language,
			"language", "l", "", "The language for which to generate the version file.")
	genVersionCmd.Flags().
		StringVarP(&genVersionArgs.OutputDir,
			"output-dir", "o", "", "The output directory were the 'version.<ext>' is generated.")
	genVersionCmd.Flags().
		StringVarP(&genVersionArgs.PackageName,
			"package-name", "p", "build", "The package name for the generated 'version.<ext>' file.")

	root.AddCommand(genVersionCmd)
}

func Execute(c *GenerateVersionData) error {
	if c.Version.String() == "" && c.Language == "" {
		comps, _, err := general.FindComponents(
			&general.ComponentArgs{ComponentDir: "."},
			".",
			".",
			nil,
			nil,
		)
		if err != nil {
			return err
		}
		if len(comps) != 1 {
			return errors.New("could not find component in current directory")
		}
		comp := comps[0]

		log.Info("Found component.", "root", comp.Root())

		config := comp.Config()
		c.Version = config.Version
		c.Language = config.Language
	}

	if c.Language == "" {
		return errors.New("language must not be empty")
	} else if c.Version.String() == "" {
		return errors.New("version must not be empty")
	}

	return genver.GenerateBuildFile(
		c.PackageName,
		&c.Version.Version,
		c.OutputDir,
		c.Language,
	)
}
