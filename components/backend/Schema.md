# Database Schema

## Capability

Whether one member-facing action is currently open in a hackathon. One row per capability per hackathon, pre-created on hackathon creation.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `capability` | enum(register, propose_projects, set_team_preferences, create_project_submissions, vote, view_results) | yes | no | yes | no | Which action this row gates. Immutable: it identifies the row. |
| `enabled` | bool | yes | no | no | yes | The authoritative gate. Phases may describe when this is expected to change, but never change it themselves — a wrong date can only produce a wrong countdown, never an unauthorized action. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the capability row was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | yes | yes | The hackathon this capability belongs to. |
| `modifier` | User | M2O | yes | no | Who last flipped the flag. Optional so seeded and backfilled rows need no attribution; set on every edit. |
| `open_in_phase` | Phase | M2O | yes | no | Phase from whose start this is expected open; null = manually driven. |
| `closed_in_phase` | Phase | M2O | yes | no | Phase at whose start this is expected to close; null = stays open. |

### Indexes

- `capability, hackathon_capabilities` *(unique)*

## FormResponse

One registrant's answers to a hackathon's registration form, validated against the organizer's schema at submission time.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `responses` | map[string]interface {} | yes | no | no | no | Field answers keyed by the form field key. |
| `consents` | map[string]bool | yes | no | no | no | Consent checkboxes keyed by the consent key. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the response was submitted. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | yes | yes | The hackathon the response belongs to. |
| `user` | User | M2O | yes | yes | The registrant the response is about. |
| `submitted_by` | User | M2O | yes | yes | Who actually entered it — the registrant, or an organizer digitizing a paper form. |

### Indexes

- `hackathon_form_responses, user_form_responses` *(unique)*

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
| `current_phase_id` | uuid.UUID | no | no | no | no | The phase an organizer has declared current. Nil means fall back to deriving it from phase dates, which is right before the event but wrong during one, where the schedule always slips. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `tracks` | Track | O2M | no | no | Thematic tracks within this hackathon. |
| `projects` | Project | O2M | no | no | Projects submitted to this hackathon. |
| `participating_users` | User | M2M | yes | no | Users who are participating or waitlisted. |
| `pages` | Page | O2M | no | no | Content pages associated with this hackathon. |
| `invites` | HackathonInvite | O2M | no | no | Shareable invitation links granting visibility of this hackathon. |
| `phases` | Phase | O2M | no | no | Temporal phases (e.g. ideation, hacking, judging). |
| `capabilities` | Capability | O2M | no | no | Which member-facing actions are available on this hackathon. |
| `current_phase` | Phase | M2O | yes | no | Set by AdvancePhase; SET NULL so deleting a phase does not orphan it. |
| `vote_categories` | VoteCategory | O2M | no | no | Voting categories scoped to this hackathon. |
| `settings` | HackathonSettings | O2O | no | no | Configuration settings for this hackathon. |
| `windows` | HackathonWindows | O2O | no | no | Enforced time windows for this hackathon. |
| `forms` | HackathonForms | O2O | no | no | Organizer-defined form schemas and voting policy. |
| `form_responses` | FormResponse | O2M | no | no | Registration form responses submitted for this hackathon. |
| `prize_table` | HackathonPrizes | O2O | no | no | The prize table and awards for this hackathon. |
| `creator` | User | M2O | yes | yes | The user who created this hackathon. |
| `modifier` | User | M2O | yes | yes | The user who last modified this hackathon. |
| `participants` | Participant | O2M | yes | no |  |

### Indexes

- `name`
- `starts_at`
- `ends_at`
- `visibility`

## HackathonForms

Organizer-defined form schemas and voting policy for a hackathon. Schemas are stored as JSON; SubmitRegistrationForm validates responses against them.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `registration_fields` | []map[string]interface {} | no | no | no | no | Registration form fields ({key,label,type,required,maxMb}). |
| `registration_consents` | []map[string]interface {} | no | no | no | no | Registration consents ({key,label,required}). |
| `submission_fields` | []map[string]interface {} | no | no | no | no | Submission form fields ({key,label,type,required,maxMb}). |
| `voting_policy` | map[string]interface {} | no | no | no | no | Pinned voting mechanism decisions (mechanism, scale, tie-breaks). |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the forms row was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | O2O | yes | yes | The hackathon these forms belong to. |
| `modifier` | User | M2O | yes | yes | The user who last modified these forms. |

## HackathonInvite

A revocable, shareable invitation link granting visibility of a private hackathon.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `token` | uuid.UUID | yes | yes | yes | yes | The secret in the invite URL. Generated server-side; never derived from the hackathon id. |
| `note` | string | no | no | no | no | Free-text reminder of who the link was sent to; organizer-facing only. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the invite was generated. |
| `revoked_at` | time.Time | no | no | no | no | When set, the link stops working. Revoking is preferred over deletion so the audit trail survives. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | M2O | yes | yes | The hackathon this invite grants visibility of. |
| `creator` | User | M2O | yes | yes | The organizer or admin who generated the link. |

### Indexes

- `token` *(unique)*

## HackathonPrizes

The organizer-defined prize table and, after Finalize, the awards. Votes are advisory: nothing is won until the admin finalizes, and the table stays admin-editable afterwards.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `prizes` | []map[string]interface {} | no | no | no | no | Prize table ({rank,title}); rank 0 is a special prize. |
| `awards` | []map[string]interface {} | no | no | no | no | Awarded submissions ({rank\|special, submissionId}) set at Finalize. |
| `finalized` | bool | yes | no | no | yes | Whether the admin has spoken; results are advisory before this. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the prize table was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | O2O | yes | yes | The hackathon this prize table belongs to. |
| `modifier` | User | M2O | yes | yes | The user who last modified the prize table. |

## HackathonSettings

Configuration settings for a hackathon.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `registrations_enabled` | bool | yes | no | no | yes | Whether new participants can register for this hackathon. |
| `voting_enabled` | bool | yes | no | no | yes | Whether voting is enabled for this hackathon. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the settings were created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | O2O | yes | yes | The hackathon this settings entry belongs to. |
| `modifier` | User | M2O | yes | yes | The user who last modified these settings. |

## HackathonWindows

Per-hackathon time windows enforced on the acting RPCs (Join, Propose, SetPreference, CreateSubmission). Unset windows are not enforced; overrides are one-shot absolute extensions granted by an organizer.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `registration_opens` | time.Time | no | no | no | no | Join is rejected before this instant. |
| `registration_closes` | time.Time | no | no | no | no | Join is rejected after this instant (unless overridden). |
| `proposals_close` | time.Time | no | no | no | no | Propose is rejected after this instant. |
| `preferences_close` | time.Time | no | no | no | no | SetPreference is rejected after this instant. |
| `submissions_close` | time.Time | no | no | no | no | CreateSubmission is rejected after this instant (unless overridden). |
| `registration_override_until` | time.Time | no | no | no | no | Manual walk-in window: registration stays open until this instant. |
| `submissions_override_until` | time.Time | no | no | no | no | Manual grace window: submissions stay open until this instant. |
| `late_policy` | string | no | no | no | no | Human-readable note on how late submissions are handled. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the windows were created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `hackathon` | Hackathon | O2O | yes | yes | The hackathon these windows belong to. |
| `modifier` | User | M2O | yes | yes | The user who last modified these windows. |

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
| `opens_capabilities` | Capability | O2M | no | no | Capabilities expected to open when this phase starts. |
| `closes_capabilities` | Capability | O2M | no | no | Capabilities expected to close when this phase starts. |
| `current_of` | Hackathon | O2M | no | no | The hackathon currently sitting in this phase, if an organizer has advanced to it. At most one in practice, since a phase belongs to exactly one hackathon. |
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

## SitePage

A platform-level content page (about, privacy, terms), addressed by slug.

### Fields

| Column | Type | Required | Unique | Immutable | Default | Description |
|--------|------|----------|--------|-----------|---------|-------------|
| `slug` | string | yes | yes | no | no | URL segment identifying the page (e.g. "about"); lowercase kebab-case. |
| `title` | string | yes | no | no | no | Title of the page. |
| `content` | string | yes | no | no | no | Markdown content of the page. Rendered through the frontend's sanitizing pipeline. |
| `visible` | bool | yes | no | no | yes | Whether the page is published. Drafts are readable by admins only. |
| `order` | int | yes | no | no | yes | Sort order for navigation listings; lower values appear first. |
| `created_at` | time.Time | yes | no | yes | yes | Timestamp when the page was created. |
| `modified_at` | time.Time | yes | no | no | yes | Timestamp of the last modification. |

### Relationships

| Edge | Target | Relation | Inverse | Required | Description |
|------|--------|----------|---------|----------|-------------|
| `creator` | User | M2O | yes | yes | The user who created this page. |
| `modifier` | User | M2O | yes | yes | The user who last modified this page. |

### Indexes

- `order`
- `visible`

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
| `created_invites` | HackathonInvite | O2M | no | no | Hackathon invitation links this user generated. |
| `created_site_pages` | SitePage | O2M | no | no | Platform pages this user created. |
| `modified_site_pages` | SitePage | O2M | no | no | Platform pages this user last modified. |
| `created_phases` | Phase | O2M | no | no | Phases this user created. |
| `modified_phases` | Phase | O2M | no | no | Phases this user last modified. |
| `created_submissions` | Submission | O2M | no | no | Submissions this user created. |
| `modified_submissions` | Submission | O2M | no | no | Submissions this user last modified. |
| `created_tracks` | Track | O2M | no | no | Tracks this user created. |
| `modified_tracks` | Track | O2M | no | no | Tracks this user last modified. |
| `modified_capabilities` | Capability | O2M | no | no | Hackathon capabilities this user last opened or closed. |
| `modified_settings` | HackathonSettings | O2M | no | no | Hackathon settings this user last modified. |
| `modified_windows` | HackathonWindows | O2M | no | no | Hackathon windows this user last modified. |
| `modified_forms` | HackathonForms | O2M | no | no | Hackathon forms this user last modified. |
| `form_responses` | FormResponse | O2M | no | no | Registration form responses about this user. |
| `submitted_form_responses` | FormResponse | O2M | no | no | Registration form responses this user entered. |
| `modified_prizes` | HackathonPrizes | O2M | no | no | Prize tables this user last modified. |
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

