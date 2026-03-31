package gorunner

import (
	"github.com/creasty/defaults"
	"github.com/sdsc-ordes/quitsh/pkg/component/step"
)

type (
	LintConfig struct {
		CheckBuildConstraints struct {
			Enable bool                  `yaml:"enable"`
			Rules  []BuiltConstraintRule `yaml:"rules"`
		} `yaml:"checkBuildConstraints"`
	}

	BuiltConstraintRule struct {
		// Which files to include by glob pattern.
		IncludePatterns []string `yaml:"includePatterns"`

		// The build constraint must match the following
		// string exactly.
		Constraints []string `yaml:"constraints"`
	}
)

func UnmarshalLintConfig(raw step.AuxConfigRaw) (step.AuxConfig, error) {
	config := &LintConfig{} //nolint: exhaustruct // intended
	err := defaults.Set(config)
	if err != nil {
		return nil, err
	}

	// Deserialize if we have something.
	if raw.Unmarshal != nil {
		err = raw.Unmarshal(config)
		if err != nil {
			return nil, err
		}
	}

	return config, nil
}
