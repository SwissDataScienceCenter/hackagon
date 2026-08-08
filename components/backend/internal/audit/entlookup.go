package audit

import (
	"context"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
)

// EntLookup resolves a Keycloak subject to the platform username stored
// against it. Exactly one column is selected: nothing else about the person is
// read, so nothing else can end up in the journal by accident.
//
// This runs on the journal's writer goroutine and is memoized by Resolver, so
// a given subject costs one query per process (or per negativeTTL while the
// person has not registered yet).
func EntLookup(db *ent.Client) Lookup {
	if db == nil {
		return nil
	}

	return func(ctx context.Context, sub string) (string, bool) {
		username, err := db.User.Query().
			Where(user.KeycloakIDEQ(sub)).
			Select(user.FieldUsername).
			String(ctx)
		if err != nil || username == "" {
			return "", false
		}

		return username, true
	}
}
