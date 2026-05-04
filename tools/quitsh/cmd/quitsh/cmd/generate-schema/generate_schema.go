package generateschema

import (
	"os"
	goexec "os/exec"
	"path/filepath"

	"github.com/sdsc-ordes/quitsh/pkg/exec"
	"github.com/sdsc-ordes/quitsh/pkg/exec/git"
	"github.com/sdsc-ordes/quitsh/pkg/log"

	"github.com/spf13/cobra"
)

const longDesc = `
Generate the Ent schema Go code and a human-readable Markdown
documentation of the database schema (Schema.md).
`

func AddCmd(root *cobra.Command) {
	cmd := &cobra.Command{
		Use:   "generate-schema",
		Short: "Generate Ent schema code and documentation.",
		Long:  longDesc,
		RunE: func(_ *cobra.Command, _ []string) error {
			_, rootDir, err := git.NewCtxAtRoot(".")
			if err != nil {
				return err
			}
			return run(rootDir)
		},
	}

	root.AddCommand(cmd)
}

func run(rootDir string) error {
	backendDir := filepath.Join(rootDir, "components", "backend")

	goCtx := exec.NewCmdCtxBuilder().
		BaseCmd("go").
		Cwd(backendDir).
		Env("GOWORK=off").
		Build()

	log.Info("Generating Ent schema code.")

	// ent generate --target requires the target to be a loadable Go package.
	// On a fresh checkout the directory is empty, so we seed it with a minimal
	// doc.go that satisfies the package loader before codegen runs.
	entDir := filepath.Join(backendDir, "ent")
	if err := os.MkdirAll(entDir, 0o755); err != nil {
		return err
	}
	docGo := filepath.Join(entDir, "doc.go")
	if _, err := os.Stat(docGo); os.IsNotExist(err) {
		if err := os.WriteFile(docGo, []byte("package ent\n"), 0o644); err != nil {
			return err
		}
	}

	err := goCtx.Check(
		"run",
		"-mod=mod",
		"entgo.io/ent/cmd/ent",
		"generate",
		"--target",
		"./ent",
		"./db/schema/",
	)
	if err != nil {
		return err
	}

	log.Info("Generating schema documentation.")
	outPath := filepath.Join(backendDir, "Schema.md")

	cmd := goexec.Command("go", "run", "-mod=mod", "./cmd/schemadoc")
	cmd.Dir = backendDir
	cmd.Env = append(os.Environ(), "GOWORK=off")
	cmd.Stderr = os.Stderr

	output, err := cmd.Output()
	if err != nil {
		return err
	}

	err = os.WriteFile(outPath, output, 0o644)
	if err != nil {
		return err
	}

	log.Infof("Schema documentation written to '%s'.", outPath)

	return nil
}
