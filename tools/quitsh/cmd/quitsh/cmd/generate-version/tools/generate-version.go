//go:build tools

// This exectuable can be used in`//go:generate` statements
// to dynamically generate a version.

package main

import (
	"os"

	generateversion "github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/generate-version"

	"github.com/sdsc-ordes/quitsh/pkg/log"
)

func main() {
	c, _ := os.Getwd()
	log.Setup("info")

	log.Info("Generate version.", "cwd", c)
	data := generateversion.GenerateVersionData{OutputDir: os.Args[1]}
	err := generateversion.Execute(&data)
	if err != nil {
		log.PanicE(err, "could not generate version file")
	}
}
