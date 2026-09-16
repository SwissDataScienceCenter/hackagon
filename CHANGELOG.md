# Changelog

All notable changes to Hackagon are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

Entries are written by hand, one line per user-visible change, added in the same
pull request that makes the change. Write for someone who has never opened the
codebase: say what a person can now do, not which function changed. Anything
invisible to a user of the platform — a refactor, a test, a CI tweak — does not
need an entry.

`just version::bump` stamps the accumulated `[Unreleased]` section with the new
version and today's date, so the release notes for a version are whatever was
written while it was being built. See [RELEASING.md](RELEASING.md).

## [Unreleased]

### Added

- A hackathon now has one address, whether you are signed in or not. Opening it
  shows the same page to everybody, with a way in at the top if you are already
  taking part — signing in used to move you to a different-looking page, and
  members could not see the public one at all. The member area links back out to
  it from the sidebar.

- A hackathon's public page now shows its schedule and how many people are
  taking part, so you can see what happens and when before deciding to register.
  It never names a participant.

- Platform administrators get a Hackathons page beside Users, listing every
  hackathon including the private ones. A private hackathon an administrator had
  neither created nor joined could not be reached from anywhere in the app.

### Changed

- A deployment can now be reached under any hostnames, not only `app.<domain>`
  and `auth.<domain>`. The app's hostname is the first entry of
  `frontend.ingress.hosts`, Keycloak's is `keycloak.hostname.hostname`, and the
  chart derives the ingresses, the TLS certificates, the OIDC issuer urls and
  the realm's login redirect urls from those two. Previously the subdomains were
  fixed in the chart's templates, so changing either value pointed the traffic
  at one name while the login flow still expected the other. Both values are now
  required: the chart refuses to render rather than guessing a hostname nothing
  is served under, and the two OIDC issuer settings are gone from `values.yaml`
  because they only ever had one working value.
- Your hackathon lists are now grouped by when they happen — Happening now,
  Coming up, Finished — and each one says how far away it is: "starts in 4
  days", "day 1 of 4", "ended 3 days ago". The dates are still there behind the
  phrase, and the status label is gone, since the heading above the row says the
  same thing.

- A private hackathon is marked with a small padlock after its name, in the
  lists, on its own page and in its sidebar. Public hackathons are not marked:
  that is what a hackathon is taken to be.

- The About tab inside a hackathon is gone. What the organisers wrote is on the
  Overview now, which is the page you land on.

- Pages an organiser has not published no longer appear in the hackathon's
  navigation. They are reached through Manage Pages, which has moved above
  Manage Voting.

- A hackathon overview with no phase running no longer opens with "No phase is
  running" and a footnote saying the timeline follows the dates alone. The card
  now starts with what people can actually do; if a phase is coming up, the
  countdown to it sits on the "Next" line at the foot.

- While you are on a hackathon's waiting list you no longer see the inside of
  it. Waiting for approval used to show you the same view as a confirmed
  participant, the list of everyone taking part included. You now stay on the
  hackathon's public page until an organiser approves you, and can still go back
  and correct your registration answers from there.

### Fixed

- A public hackathon no longer hands its participant list to the internet.
  Anyone could read the name, e-mail address and account id of everybody signed
  up, without an account of their own. Signing up for a public hackathon, and
  reading its registration questions before you do, work exactly as before.

## [0.9.1](https://github.com/SwissDataScienceCenter/hackagon/compare/v0.9.0...v0.9.1) - 2026-09-11

## [0.9.0](https://github.com/SwissDataScienceCenter/hackagon/compare/v0.8.0...v0.9.0) - 2026-09-11

### Added

- You can now change your own password. Your name in the top right opens a new
  Account page, whose Change password button takes you to the sign-in service
  and brings you back. It asks you to sign in once more on the way, which is
  what proves it is you. Forgetting a password is still not self-service, so the
  page says to ask a platform administrator instead.

### Changed

- Following an invitation link into a private hackathon now admits you straight
  away, rather than putting you on a list for an organiser to approve. The
  invitation is the decision. Public hackathons are unchanged.
- Manage Participants no longer shows a Waitlist tab on a private hackathon,
  where nobody should ever be waiting. It reappears if somebody is.

### Fixed

- A server problem while joining a hackathon no longer claims that your sign-in
  has expired. A rejected login and a real fault are told apart again.
- Invitation links no longer fail with "This invitation is no longer valid" for
  people who have never used Hackagon before. The link was always fine — their
  account had simply never been created.
- After accepting an invitation to a private hackathon, the page told people
  they were on a list and that organisers would confirm their place, when they
  were already full members. It now says "You're in" and links into the event.
- An invitation that only half went through used to leave somebody holding a
  place they could not see, with nothing they could do about it. The invitation
  page now offers "Finish joining", which completes it.

## [0.8.0](https://github.com/SwissDataScienceCenter/hackagon/releases/tag/v0.8.0) - 2026-09-08

The first tagged release, and the one currently in production. It predates this
changelog, so this entry summarises what the release contains rather than
reconstructing its 735 commits.

### Added

- **Authentication and authorisation**: Keycloak for login; casbin for
  per-hackathon roles, with global admin as an override.
- **Hackathons**: Organisers can create a hackathon and are then owners of that
  hackathon, but can also give that role to other registered users.
- **Hackathon Owners**: edit it, and drive a hackathon. Capability switches
  decide what participants may do. A hackathon has phases, but capabilities are
  independent of phases. Tracks are optional. A hackathon can have more than one
  owner.
- **A public page per hackathon**: Owners can publish a markdown page on the
  hackathon which is visible on the public part of the website.
- **Registration**: Owners create a registration form and decide which answers
  will be visible to other participants. For public hackathons registered users
  can ask to join the hackathon by clicking a button on the public website. They
  will then be redirected to fill in the registration form. The owner sees the
  answers and can approve or reject their participation.
- **Private hackathons by invitation link**: For private hackathons a link to an
  unlisted page is distributed where participants can ask join. Registration to
  a private hackathon follows otherwise the same process as registration to a
  public hackathon.
- **Participants**: A roster that can be handed to a mailing tool, so the owner
  can communicate with the participants of his hackathon.
- **Projects**: Projects can be either proposed by the hackathon owner or by the
  Participants depending on the settings for the hackathon. In case Participants
  can propose projects the owners can approve or reject them.
- **Teams**: Participants can set preferences for projects they want to work on
  during the hackathon. Then owners can use the preferences and the the answers
  on the registration form to build balanced teams by either downloading the
  data and uploading team assignments or by using a platform tool to make a
  suggestion that they can refine. Team assignments can be updated on bulk or as
  individual records. **Submissions** Any member of a team can make a versioned
  submission on behalf of the team. A submission is a weblink (to a github repo
  or other artifacts). A submission can be declared as final. That will make
  visible to other teams during the voting.
- **Voting**: The owners can setup voting categories and methods and allow
  participants to vote for other teams.
- **Pages**: The owners can add markdown pages and decide whether they should be
  visible to participants.

- **Deployment**: A Helm chart published as an OCI artifact, container images
  built and pushed by CI, a gRPC health check, and the deployed version shown in
  the footer.
