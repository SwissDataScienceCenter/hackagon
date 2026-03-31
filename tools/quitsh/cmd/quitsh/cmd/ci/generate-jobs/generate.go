package cigeneratejobs

import (
	"path"

	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/config"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/custodian/pipeline"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"

	"github.com/spf13/cobra"
)

const longDescGenerateJobs = `
Generate CI jobs for building.
`

type generateArgs struct {
	pipelineType string
	output       string
}

func AddCmd(
	cl cli.ICLI,
	root *cobra.Command,
	ciSetts *config.CISettings,
	generateJobs pipeline.GenerateFunc,
) {
	var args generateArgs

	ciCmd := &cobra.Command{
		Use:   "generate-pipeline",
		Short: "Generate CI jobs pipeline.",
		Long:  longDescGenerateJobs,
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return generateJobs(
				cl,
				args.pipelineType,
				args.output,
				ciSetts.PipelineSettingsFile,
			)
		},
	}

	ciCmd.Flags().
		StringVarP(&args.pipelineType,
			"type", "t",
			"gitlab",
			"The pipeline type to generate jobs for. [gitlab]",
		)

	ciCmd.Flags().
		StringVarP(&args.output,
			"output", "o",
			path.Join(fs.OutputDir, fs.OutCIDir, "pipeline.yaml"),
			"The output file to write the pipeline jobs (relative to the root directory).",
		)

	ciCmd.Flags().
		StringVar(&ciSetts.PipelineSettingsFile,
			"pipeline-settings",
			ciSetts.PipelineSettingsFile,
			"The serialization file (YAML) with the pipeline settings\n."+
				"You get this file from the pipeline artifact or "+
				"loading one in the repository.",
		)

	root.AddCommand(ciCmd)
}
