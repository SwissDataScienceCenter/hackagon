package build

import (
	"fmt"

	"github.com/hashicorp/go-version"
)

// This string is set in the Go runner with
// `-ldflags -X ".../pkg/build.buildVersion=..."`.
var buildVersion = "1.17.0" //nolint:gochecknoglobals // Allowed for version.

func Version() *version.Version {
	ver, err := version.NewVersion(buildVersion)
	if err != nil {
		panic(fmt.Sprintf("Build version '%v' is not valid.", buildVersion))
	}

	return ver
}
