package schema

import (
	"log"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/mixin"
	"github.com/google/uuid"
)

type UUIDMixin struct {
	mixin.Schema
}

func (UUIDMixin) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(func() uuid.UUID {
				id, err := uuid.NewV7()
				if err != nil {
					log.Fatalf("couldn't create UUID: %v", err)
				}

				return id
			}).
			Immutable()}
}
