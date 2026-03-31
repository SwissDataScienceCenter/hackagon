package image

import (
	"fmt"

	"github.com/sdsc-ordes/quitsh/pkg/image"
)

// NewImagePackageName return the components image package name for
// the image type.
func NewImagePackageName(compName string, imageType image.Type) string {
	return fmt.Sprintf("%s-%s", compName, imageType.String())
}
