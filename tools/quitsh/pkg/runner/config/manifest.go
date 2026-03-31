package config

import "github.com/sdsc-ordes/quitsh/pkg/common"

type ManifestSettings struct {
	// The directory where different instances of a deployment are
	// maintained.
	DeploymentsDir  string                 `yaml:"deploymentsDir"`
	Domain          string                 `yaml:"domain" default:"local"`
	EnvironmentType common.EnvironmentType `yaml:"environmentType"`

	// If the domain and environment type is not added to the output name.
	NoSpecificOutputName bool `yaml:"noSpecificOutputName"`

	// Do not delete the '.pre-manifests' folder.
	KeepPreManifests bool `yaml:"keepPreManifests"`

	// Do not use 'sops decrypt' and try rendering without.
	RunSops bool `yaml:"runSops"`

	// Run `kbld` to resolve image references and apply optional
	// 'ImageLocks' CRDs which might also be in the sources.
	RunKbld bool `yaml:"runKbld"`
	// When `RunKbld` is turned on also produce a `.imgpkg/images.yaml` lock file
	// for `imgpkg`.
	ImgPkgLock bool `yaml:"imgPkgLock" default:"true"`
	// Run a final bundling step. Implies `ImgPkgLock: true`, `RunKbld: true`
	// This will produce an `imgpkg` bundle.
	Bundle bool `yaml:"bundle"`

	// Run vendir before rendering.
	RunVendir bool `yaml:"runVendir"`
	// Use no lockfile when vendir is run. Default it uses a lock file.
	VendirNoLock bool `yaml:"vendirNoLock"`

	// Output to stdout instead of writing to build dir.
	Stdout bool `yaml:"stdout"`

	Args []string `yaml:"args"` // Additional arguments forwarded to the tool.
}
