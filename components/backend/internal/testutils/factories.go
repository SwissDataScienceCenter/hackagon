package testutils

import (
	"context"
	"time"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entHackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
)

// CreateTestUser creates a test user with the given keycloak ID and username.
func CreateTestUser(db *ent.Client, keycloakID, username string) (*ent.User, error) {
	return db.User.Create().
		SetKeycloakID(keycloakID).
		SetUsername(username).
		SetDisplayName(username).
		SetEmail(username + "@test.local").
		Save(context.Background())
}

// CreateTestUserWithEmail creates a test user with a custom email.
func CreateTestUserWithEmail(db *ent.Client, keycloakID, username, email string) (*ent.User, error) {
	return db.User.Create().
		SetKeycloakID(keycloakID).
		SetUsername(username).
		SetDisplayName(username).
		SetEmail(email).
		Save(context.Background())
}

// CreateTestHackathon creates a test hackathon with the given name and visibility.
func CreateTestHackathon(db *ent.Client, name string, visibility entHackathon.Visibility) (*ent.Hackathon, error) {
	return CreateTestHackathonWithDates(db, name, visibility, time.Now(), time.Now().Add(48*time.Hour))
}

// CreateTestHackathonWithDates creates a test hackathon with explicit start/end dates.
func CreateTestHackathonWithDates(db *ent.Client, name string, visibility entHackathon.Visibility, startsAt, endsAt time.Time) (*ent.Hackathon, error) {
	create := db.Hackathon.Create().
		SetName(name).
		SetVisibility(visibility).
		SetStartsAt(startsAt).
		SetEndsAt(endsAt)

	return create.Save(context.Background())
}

// CreateTestPage creates a test page with the given title and content.
func CreateTestPage(db *ent.Client, title, content string) (*ent.Page, error) {
	return db.Page.Create().
		SetTitle(title).
		SetContent(content).
		Save(context.Background())
}

// CreateTestPhase creates a test phase with the given name and description.
func CreateTestPhase(db *ent.Client, name, description string) (*ent.Phase, error) {
	return db.Phase.Create().
		SetName(name).
		SetDescription(description).
		Save(context.Background())
}

// CreateTestProject creates a test project with the given title and description.
func CreateTestProject(db *ent.Client, title, description string) (*ent.Project, error) {
	return db.Project.Create().
		SetTitle(title).
		SetDescription(description).
		Save(context.Background())
}

// CreateTestTeam creates a test team with the given name and description.
func CreateTestTeam(db *ent.Client, name, description string) (*ent.Team, error) {
	return db.Team.Create().
		SetName(name).
		SetDescription(description).
		Save(context.Background())
}
