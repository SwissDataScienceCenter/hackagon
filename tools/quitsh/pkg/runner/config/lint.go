package config

type LintSettings struct {
	// Additional arguments forwarded to the lint tool.
	Args []string `yaml:"args"`

	// Try to fix linting errors.
	Fix bool `yaml:"fix"`
}

// NewLintSettings constructs a new build setting.
func NewLintSettings(
	args []string,
) LintSettings {
	return LintSettings{
		Args: args,
		Fix:  false,
	}
}
