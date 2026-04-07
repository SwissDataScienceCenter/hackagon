package nodepnpmrunner

import (
	"github.com/sdsc-ordes/quitsh/pkg/component/step"

	"github.com/creasty/defaults"
	"github.com/go-playground/validator/v10"
)

type RunnerConfigLint struct {
	Tool     string   `default:"vitest"`
	ToolArgs []string `default:"-"`
}

func (c *RunnerConfigLint) Validate() error {
	return validator.New().Struct(c)
}

// The unmarshaller for the [RunnerConfigLint].
func UnmarshalLintConfig(raw step.AuxConfigRaw) (step.AuxConfig, error) {
	config := &RunnerConfigLint{} //nolint:exhaustruct // intentional
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
