package manifest

import (
	"errors"
	"fmt"

	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/image"
	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/pkg/runner/config"

	"github.com/sdsc-ordes/quitsh/pkg/cli"
	"github.com/sdsc-ordes/quitsh/pkg/cli/general"
	"github.com/sdsc-ordes/quitsh/pkg/common"
	"github.com/sdsc-ordes/quitsh/pkg/component/stage"
	"github.com/sdsc-ordes/quitsh/pkg/dag"
	"github.com/spf13/cobra"
)

type renderArgs struct {
	compArgs general.ComponentArgs
}

func AddCmd(
	cl cli.ICLI,
	maniSetts *config.ManifestSettings,
	imgSetts *config.ImageSettings,
	execArgs *dag.ExecArgs) {
	var args renderArgs
	renderCmd := &cobra.Command{
		Use:     "manifest",
		Aliases: []string{"render"},
		Short:   "Render the manifest file.",
		Long:    "Render the manifest file.",
		PreRunE: func(_cmd *cobra.Command, _args []string) error {
			return nil
		},
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return execute(cl, &args, execArgs)
		},
	}

	renderCmd.Flags().
		StringVar(&maniSetts.DeploymentsDir, "deployments-dir", maniSetts.DeploymentsDir, "The custom deployments directory.")
	renderCmd.Flags().
		StringVarP(&maniSetts.Domain, "domain", "d", maniSetts.Domain, "The domain used for deployment.")
	renderCmd.Flags().
		VarP(&maniSetts.EnvironmentType,
			"env-type", "e", fmt.Sprintf("The environment type. (%s)", common.GetEnvTypesHelp()))

	renderCmd.Flags().BoolVar(
		&maniSetts.NoSpecificOutputName, "no-specific-output-name", maniSetts.NoSpecificOutputName,
		"If the output name should not contain domain and environment type.")

	renderCmd.Flags().BoolVar(
		&maniSetts.KeepPreManifests, "keep-pre-manifests", maniSetts.KeepPreManifests,
		"Keep the '.pre-manifest' folder instead of deleting it.")

	renderCmd.Flags().BoolVar(
		&maniSetts.RunSops, "run-sops", maniSetts.RunSops,
		"Do not use 'sops' decrypt and try rendering without.")

	renderCmd.Flags().BoolVar(
		&maniSetts.RunKbld, "run-kbld", maniSetts.RunKbld,
		"Run `kbld` over the result to resolve images and apply optional 'ImageLocks' CRDs.")

	renderCmd.Flags().BoolVar(
		&maniSetts.ImgPkgLock, "imgpkg-lock", maniSetts.ImgPkgLock,
		"Run `kbld` over the result to get an `.imgpkg/images.yaml` lock output file for `imgpkg`.")

	renderCmd.Flags().BoolVar(
		&maniSetts.Bundle, "run-bundle", maniSetts.Bundle,
		"Run `imgpkg` step to produce a bundle (OCI image) and optionally upload it.")

	renderCmd.Flags().BoolVar(
		&maniSetts.Stdout, "stdout", maniSetts.Stdout,
		"Output manifests to stdout instead of build folder.")

	renderCmd.Flags().BoolVar(
		&maniSetts.RunVendir, "run-vendir", maniSetts.RunVendir,
		"Do not run vendir before rendering.")

	renderCmd.Flags().BoolVar(
		&maniSetts.VendirNoLock, "vendir-no-lock", maniSetts.VendirNoLock,
		"Don't use `--locked` when vendir runs, resulting to updating the lock file.")

	renderCmd.Flags().
		StringArrayVarP(&args.compArgs.ComponentPatterns,
			"components", "c", args.compArgs.ComponentPatterns, "Components matched by these patterns are built.")

	image.AddPushFlagsGeneral(renderCmd, imgSetts)

	cl.RootCmd().AddCommand(renderCmd)
}

func execute(cl cli.ICLI, args *renderArgs, execArgs *dag.ExecArgs) error {
	comps, all, rootDir, err := cl.FindComponents(&args.compArgs)
	if err != nil {
		return err
	}

	targets, prios, err := dag.DefineExecutionOrder(
		all,
		rootDir,
		dag.WithTargetsByStageFromComponents(comps, stage.Stage("manifest")),
	)
	if err != nil {
		return err
	} else if len(targets) == 0 {
		return errors.New("no targets selected")
	}

	return dag.Execute(
		targets,
		prios,
		cl.RunnerFactory(),
		cl.ToolchainDispatcher(),
		cl.Config(),
		rootDir,
		cl.RootArgs().Parallel,
		dag.WithTags(execArgs.Tags...),
	)
}
