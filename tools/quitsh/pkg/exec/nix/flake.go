package nix

import (
	"fmt"

	"github.com/sdsc-ordes/quitsh/pkg/exec/nix"
	"github.com/sdsc-ordes/quitsh/pkg/image"
)

const DefaultFlakeDirRel = "tools/nix"

// NixComponentImageInstallable returns a installable to the components image for `nix build`.
func NixComponentImageInstallable(
	flakePath string,
	componentName string,
	imageType image.Type,
) (installable, pkgName string) {
	pkgName = fmt.Sprintf(
		"%s-%s-image",
		componentName,
		imageType.String(),
	)

	return nix.FlakeInstallable(flakePath, pkgName), pkgName
}
