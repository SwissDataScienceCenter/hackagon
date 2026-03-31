package containermgr

import "fmt"

const (
	// If you change this here -> adjust the `New*` functions.
	Docker Type = 0
	Podman Type = 1

	RegistryTempName    = "docker"
	RegistryReleaseName = "podman"
)

type Type int

func NewType(s string) (Type, error) {
	switch s {
	case RegistryReleaseName:
		return Podman, nil
	case RegistryTempName:
		return Docker, nil
	}

	return 0, fmt.Errorf("wrong registry type '%s'", s)
}

// Implement the pflags Value interface.
func (v Type) String() string {
	switch v {
	case Podman:
		return RegistryReleaseName
	case Docker:
		return RegistryTempName
	}

	panic("Not implemented.")
}

// Implement the pflags Value interface.
func (v *Type) Set(s string) (err error) {
	*v, err = NewType(s)

	return
}

// GetAllRegistryTypes returns all registry types.
func GetAllRegistryTypes() []Type {
	return []Type{Docker, Podman}
}

// Implement the pflags Value interface.
func (v *Type) Type() string {
	return "string"
}

// UnmarshalYAML unmarshals from YAML.
func (v *Type) UnmarshalYAML(unmarshal func(any) error) (err error) {
	var s string
	err = unmarshal(&s)
	if err != nil {
		return
	}

	*v, err = NewType(s)

	return
}

// MarshalYAML marshals to YAML.
// Note: needs to be value-receiver to be called!
func (v Type) MarshalYAML() (any, error) {
	return v.String(), nil
}
