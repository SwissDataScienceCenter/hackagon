package nodepnpmrunner

import (
	"github.com/sdsc-ordes/quitsh/pkg/component/step"

	"github.com/creasty/defaults"
	"github.com/go-playground/validator/v10"
)

type RunnerConfigTest struct {
	Tool     string   `yaml:"tool" default:"vitest"`
	ToolArgs []string `yaml:"toolArgs" default:"-"`
	ToolEnv  []string `yaml:"toolEnv" default:"-"`
}

func (c *RunnerConfigTest) Validate() error {
	return validator.New().Struct(c)
}

// UnmarshalTestConfig is the unmarshaller for the [RunnerConfigTest].
func UnmarshalTestConfig(raw step.AuxConfigRaw) (step.AuxConfig, error) {
	config := &RunnerConfigTest{} //nolint:exhaustruct,nolintlint
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

	err = config.Validate()
	if err != nil {
		return nil, err
	}

	return config, nil
}
