# Database Schema

## Hackathon

A hackathon event containing tracks, projects, phases, and participants.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `name` | string | yes | yes | no | no | Display name of the hackathon, must be unique. |
| `starts_at` | time.Time | no | no | no | no | Scheduled start time; nil if not yet scheduled. |
| `ends_at` | time.Time | no | no | no | no | Scheduled end time; nil if not yet scheduled. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the hackathon was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |
| `visibility` | enum(public, private) | yes | no | no | no | Controls whether non-participants can discover this hackathon. |
| `description` | string | no | no | no | no | Detailed description of the hackathon, supports rich text. |
| `logo` | string | no | no | no | no | URL or path to the hackathon logo image. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `tracks` | Track | O2M | no | no | Thematic tracks within this hackathon. |
| `projects` | Project | O2M | no | no | Projects submitted to this hackathon. |
| `participating_users` | User | M2M | yes | no | Users who are participating or waitlisted. |
| `pages` | Page | O2M | no | no | Content pages associated with this hackathon. |
| `phases` | Phase | O2M | no | no | Temporal phases (e.g. ideation, hacking, judging). |
| `vote_categories` | VoteCategory | O2M | no | no | Voting categories scoped to this hackathon. |
| `creator` | User | M2O | yes | yes | The user who created this hackathon. |
| `modifier` | User | M2O | yes | yes | The user who last modified this hackathon. |
| `participants` | Participant | O2M | yes | no |  |

### Indexes

- `name`
- `starts_at`
- `ends_at`
- `visibility`

## Page

A content page associated with a hackathon, used for information display.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `title` | string | yes | no | no | no | Title of the page. |
| `content` | string | yes | no | no | no | Rich text content of the page. |
| `visible` | bool | yes | no | no | yes | Whether the page is visible to participants. |
| `order` | int | yes | no | no | no | Sort order for display; lower values appear first. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the page was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | yes | yes | The hackathon this page belongs to. |
| `phase` | Phase | O2O | yes | no | The phase this page is linked to, if any. |
| `creator` | User | M2O | yes | yes | The user who created this page. |
| `modifier` | User | M2O | yes | yes | The user who last modified this page. |

### Indexes

- `order`
- `visible`

## Participant

Join table for the M2M relationship between users and hackathons, with participation metadata.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `hackathon_id` | uuid.UUID | yes | no | no | no | Foreign key to the hackathon. |
| `user_id` | uuid.UUID | yes | no | no | no | Foreign key to the user. |
| `is_waiting` | bool | yes | no | no | yes | Whether the participant is on the waitlist (true) or confirmed (false). |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the participant joined. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | no | yes | The hackathon being participated in. |
| `user` | User | M2O | no | yes | The participating user. |

## Phase

A temporal phase of a hackathon (e.g. ideation, hacking, judging).

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `starts_at` | time.Time | no | no | no | no | When this phase begins; nil if not yet scheduled. |
| `ends_at` | time.Time | no | no | no | no | When this phase ends; nil if not yet scheduled. |
| `name` | string | yes | no | no | no | Display name of the phase. |
| `description` | string | no | no | no | no | Description of the phase and its objectives. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the phase was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | yes | yes | The hackathon this phase belongs to. |
| `page` | Page | O2O | no | no | Content page linked to this phase. |
| `creator` | User | M2O | yes | yes | The user who created this phase. |
| `modifier` | User | M2O | yes | yes | The user who last modified this phase. |

### Indexes

- `starts_at`
- `ends_at`
- `name`

## Project

A project proposal within a hackathon track.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `title` | string | yes | no | no | no | Title of the project. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the project was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |
| `status` | enum(proposed, approved) | yes | no | no | no | Approval status of the project. |
| `image` | string | no | no | no | no | URL or path to the project cover image. |
| `description` | string | yes | no | no | no | Detailed description of the project. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `track` | Track | M2O | yes | no | The track this project belongs to (optional). |
| `hackathon` | Hackathon | M2O | yes | yes | The hackathon this project belongs to. |
| `creator` | User | M2O | yes | yes | The user who proposed this project. |
| `modifier` | User | M2O | yes | yes | The user who last modified this project. |
| `teams` | Team | O2M | no | no | Teams working on this project. |
| `submissions` | Submission | O2M | no | no | Submissions made for this project. |
| `preferred_by_users` | User | M2M | yes | no | Users who marked this project as preferred. |

### Indexes

- `title`
- `status`

## Submission

A versioned submission from a team for a project.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the submission was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |
| `result` | string | no | no | no | no | Result or output of the submission (e.g. a URL). |
| `status` | enum(draft, final) | yes | no | no | no | Whether the submission is a draft or final. |
| `version` | int | yes | no | no | no | Monotonically increasing version number, unique per project+team. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `team` | Team | M2O | yes | yes | The team that made this submission. |
| `project` | Project | M2O | yes | yes | The project this submission is for. |
| `creator` | User | M2O | yes | yes | The user who created this submission. |
| `modifier` | User | M2O | yes | no | The user who last modified this submission. |
| `votes` | Vote | M2M | no | no | Votes cast on this submission. |
| `vote_results` | VoteResult | O2M | no | no | Vote results placing this submission. |

### Indexes

- `version, project_submissions, team_submissions` *(unique)*

## Team

A team of participants working on a project.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `name` | string | yes | no | no | no | Display name of the team. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the team was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |
| `description` | string | no | no | no | no | Optional description of the team. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `project` | Project | M2O | yes | yes | The project this team is working on. |
| `creator` | User | M2O | yes | yes | The user who created this team. |
| `modifier` | User | M2O | yes | no | The user who last modified this team. |
| `submissions` | Submission | O2M | no | no | Submissions made by this team. |
| `members` | User | M2M | yes | no | Users who are members of this team. |
| `team_participants` | TeamParticipant | O2M | yes | no |  |

## TeamParticipant

Join table for the M2M relationship between users and teams.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `team_id` | uuid.UUID | yes | no | no | no | Foreign key to the team. |
| `user_id` | uuid.UUID | yes | no | no | no | Foreign key to the user. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the user joined the team. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `team` | Team | M2O | no | yes | The team. |
| `user` | User | M2O | no | yes | The team member. |

## Track

A thematic track within a hackathon that groups related projects.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `name` | string | yes | no | no | no | Display name of the track. |
| `description` | string | yes | no | no | no | Description of the track's theme and goals. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the track was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | yes | no | The hackathon this track belongs to. |
| `projects` | Project | O2M | no | no | Projects within this track. |
| `creator` | User | M2O | yes | yes | The user who created this track. |
| `modifier` | User | M2O | yes | yes | The user who last modified this track. |

### Indexes

- `name, hackathon_tracks` *(unique)*

## User

An authenticated user, synced from Keycloak on first login.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `username` | string | yes | no | no | no | Username in Keycloak. |
| `keycloak_id` | string | yes | yes | no | no | Unique identifier from Keycloak (sub claim). |
| `display_name` | string | no | no | no | yes | Preferred display name of the user. |
| `email` | string | no | no | no | yes | Email of the user, same as in Keycloak |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the user was first seen. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last profile update. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `created_hackathons` | Hackathon | O2M | no | no | Hackathons this user created. |
| `modified_hackathons` | Hackathon | O2M | no | no | Hackathons this user last modified. |
| `created_projects` | Project | O2M | no | no | Projects this user created. |
| `modified_projects` | Project | O2M | no | no | Projects this user last modified. |
| `participates_in_hackathons` | Hackathon | M2M | no | no | Hackathons this user participates in. |
| `participates_in_teams` | Team | M2M | no | no | Teams this user is a member of. |
| `created_teams` | Team | O2M | no | no | Teams this user created. |
| `modified_teams` | Team | O2M | no | no | Teams this user last modified. |
| `created_pages` | Page | O2M | no | no | Content pages this user created. |
| `modified_pages` | Page | O2M | no | no | Content pages this user last modified. |
| `created_phases` | Phase | O2M | no | no | Phases this user created. |
| `modified_phases` | Phase | O2M | no | no | Phases this user last modified. |
| `created_submissions` | Submission | O2M | no | no | Submissions this user created. |
| `modified_submissions` | Submission | O2M | no | no | Submissions this user last modified. |
| `created_tracks` | Track | O2M | no | no | Tracks this user created. |
| `modified_tracks` | Track | O2M | no | no | Tracks this user last modified. |
| `preferred_projects` | Project | M2M | no | no | Projects this user has marked as preferred. |
| `votes` | Vote | O2M | no | no | Votes cast by this user. |
| `jury_categories` | VoteCategory | M2M | no | no | Vote categories where this user is a jury member. |
| `participations` | Participant | O2M | yes | no |  |
| `team_participations` | TeamParticipant | O2M | yes | no |  |

## Vote

A single atomic judgment from one voter on one submission within one category.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `vote_type` | enum(single_choice, ranked, points) | yes | no | no | no | Discriminator for the vote method. |
| `value` | int | no | no | no | no | Rank position (ranked) or points awarded (points-based). Optional for single_choice. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `category` | VoteCategory | M2O | yes | yes | The vote category this vote belongs to. |
| `voter` | User | M2O | yes | yes | Keycloak user ID of the voter. |
| `submission` | Submission | M2M | yes | no | The submission this vote is for. |

### Indexes

- `vote_category_votes, user_votes` *(unique)*

## VoteCategory

A voting category within a hackathon, defining the criteria and rules for one dimension of evaluation.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `name` | string | yes | no | no | no | Display name of the category (e.g. "Coolness", "Novelty"). |
| `description` | string | no | no | no | no | Criteria and instructions for voters. |
| `voting_method` | enum(single_choice, ranked, points) | yes | no | no | no | How votes are cast: single choice, ranked, or points-based. |
| `voter_type` | enum(all_participants, jury) | yes | no | no | no | Who can vote: all participants or jury only. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | yes | yes | The hackathon this category belongs to. |
| `jury_members` | User | M2M | yes | no | Users assigned as jury members for this category (M2M). Only used when voter_type is JURY. |
| `votes` | Vote | O2M | no | no | All votes cast for this category. |
| `results` | VoteResult | O2M | no | no | Placements assigned to this category. |

## VoteResult

A placement entry within a vote category. Multiple VoteResults can exist per category.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `position` | int | yes | no | no | no | Ordering hint (1 = first place, 2 = second, etc.). Not unique — ties allowed. |
| `title` | string | no | no | no | no | Optional custom title for the placement (e.g. "Most Innovative"). |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `vote_category` | VoteCategory | M2O | yes | yes | The category this result belongs to. |
| `submission` | Submission | M2O | yes | yes | The submission being placed. |

