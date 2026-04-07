package runner

import (
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/config"
	containerfilerunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/containerfile"
	coveragerunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/coverage"
	docmkdocsrunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/doc-mkdocs"
	docsphinxrunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/doc-sphinx"
	"github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/gitdiffrunner"
	gorunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/go"
	hackagonrunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/hackagon"
	nixrunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/nix"
	pnpmrunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/pnpm"
	symlinkrunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/symlinks"
	trivyrunner "github.com/swissdatasciencecenter/hackagon/tools/quitsh/pkg/runner/trivy"

	"github.com/sdsc-ordes/quitsh/pkg/errors"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/sdsc-ordes/quitsh/pkg/runner/factory"
	gorunnerQuitsh "github.com/sdsc-ordes/quitsh/pkg/runner/go"
)

func RegisterAll(
	buildSettings *config.BuildSettings,
	lintSettings *config.LintSettings,
	testSettings *config.TestSettings,
	imageSettings *config.ImageSettings,
	nixSettings *config.NixSettings,
	factory factory.IFactory,
) {
	log.Trace("Register all runners.")
	var err error

	if buildSettings != nil {
		e := gorunnerQuitsh.RegisterBuild(buildSettings.WrapToIBuildSettings(), factory, true)
		err = errors.Combine(err, e)
		e = pnpmrunner.RegisterAll(
			buildSettings.WrapToIBuildSettings(),
			testSettings.WrapToITestSettings(),
			factory, true)
		err = errors.Combine(err, e)
	}

	if testSettings != nil {
		e := gorunnerQuitsh.RegisterTest(testSettings.WrapToITestSettings(), factory, true)
		err = errors.Combine(err, e)

		e = coveragerunner.Register(testSettings, factory)
		err = errors.Combine(err, e)
	}

	if lintSettings != nil {
		e := gorunner.Register(lintSettings, factory)
		err = errors.Combine(err, e)

		e = trivyrunner.Register(lintSettings, factory)
		err = errors.Combine(err, e)

		e = symlinkrunner.Register(lintSettings, factory)
		err = errors.Combine(err, e)

		e = hackagonrunner.Register(lintSettings, factory)
		err = errors.Combine(err, e)
	}

	if imageSettings != nil {
		e := nixrunner.Register(
			nixSettings.FlakeDirRel, imageSettings, nixSettings, factory)
		err = errors.Combine(err, e)
		e = containerfilerunner.Register(imageSettings, factory)
		err = errors.Combine(err, e)
	}

	e := gitdiffrunner.Register(factory, nixSettings)
	err = errors.Combine(err, e)

	e = docsphinxrunner.Register(factory)
	err = errors.Combine(err, e)

	e = docmkdocsrunner.Register(factory)
	err = errors.Combine(err, e)

	if err != nil {
		log.PanicE(err, "Could not register runners")
	}
}
