package image

import (
	"github.com/opencontainers/go-digest"
	"github.com/sdsc-ordes/quitsh/pkg/image"
)

type ImagePackages []ImagePackage

type ImagePackage struct {
	Component string `yaml:"component"`
	Version   string `yaml:"version"`

	// The image package name. (Same as basename of the image ref)
	Name      string     `yaml:"name"`
	ImageType image.Type `yaml:"imageType"`

	// For Nix build.
	NixPackage     string `yaml:"nixPackage"`
	NixInstallable string `yaml:"nixInstallable,omitempty"`

	// For normal Containerfile build.
	ContainerFile string `yaml:"containerFile,omitempty"`
	ImageFile     string `yaml:"src,omitempty"`

	// The image digest of this image.
	ImageDigest digest.Digest `yaml:"imageDigest"`

	// The image ref with full digest.
	ImageRefDigest image.ImageRefField `yaml:"imageRefDigest"`

	// Image references, the first one is the image which is built, all
	// other ones are upload references.
	ImageRefs []image.ImageRefField `yaml:"imageRefs"`
}
