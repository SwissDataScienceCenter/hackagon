#!/usr/bin/env bash
# Capability probe: which lifecycle RPCs does the running backend actually
# implement? Writes .state/capabilities.json, which the journey acts use to
# self-skip. This is what lets the lifecycle recipe grow automatically as
# write-path handlers land — no test-code change needed for an act to wake up.
#
# SAFETY: probes are UNAUTHENTICATED on purpose. Implemented mutation handlers
# follow the enforce-first pattern (RequireSubject / casbin check before any
# DB write), so an anonymous '{}' call is rejected with Unauthenticated /
# PermissionDenied / InvalidArgument without side effects — any of which
# proves the method is implemented. Missing methods return Unimplemented (or a
# reflection error for unregistered services).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

# The lifecycle methods the journey acts gate on. Methods may reference
# services or RPCs that do not exist yet even as protos — those simply probe
# as unimplemented.
METHODS=(
    hackathon.ConfigService/SetEmailTemplates
    hackathon.ConfigService/GetEmailTemplates
    hackathon.ConfigService/SetBranding
    user.UserService/DeleteAccount
    user.UserService/EditProfile
    hackathon.HackathonService/GetRegistrationResponse
    hackathon.HackathonService/ListRegistrationResponses
    hackathon.HackathonService/CreateInvite
    hackathon.HackathonService/PreviewInvite
    site.SitePageService/Get
    site.SitePageService/List
    site.SitePageService/Create
    site.SitePageService/Edit
    site.SitePageService/Delete
    hackathon.HackathonService/Get
    hackathon.HackathonService/List
    user.UserService/WhoAmI
    user.UserService/List
    user.UserService/Register
    hackathon.HackathonService/Create
    hackathon.HackathonService/Edit
    hackathon.HackathonService/Delete
    hackathon.HackathonService/Join
    hackathon.HackathonService/ApproveParticipant
    hackathon.HackathonService/RemoveParticipant
    hackathon.HackathonService/AddOwner
    hackathon.HackathonService/RemoveOwner
    hackathon.HackathonService/SetCapabilities
    hackathon.HackathonService/SetCurrentPhase
    hackathon.HackathonService/EditCapability
    hackathon.HackathonService/AdvancePhase
    vote.VoteService/SuggestResults
    storage.StorageService/CreateUploadUrl
    storage.StorageService/CreateDownloadUrl
    storage.StorageService/ListObjects
    hackathon.PageService/Create
    hackathon.PageService/Delete
    hackathon.PageService/List
    hackathon.PageService/Get
    hackathon.PageService/Edit
    hackathon.PageService/SetOrder
    hackathon.PhaseService/Create
    hackathon.TrackService/Create
    hackathon.ProjectService/Propose
    hackathon.ProjectService/Approve
    hackathon.ProjectService/Edit
    hackathon.ProjectService/Delete
    hackathon.ProjectService/SetPreference
    hackathon.ProjectService/ExportPreferences
    hackathon.TeamService/List
    hackathon.TeamService/Create
    hackathon.TeamService/Edit
    hackathon.TeamService/Delete
    hackathon.TeamService/AssignUser
    hackathon.TeamService/RemoveUser
    hackathon.TeamService/CreateSubmission
    hackathon.TeamService/EditSubmission
    hackathon.TeamService/FinalizeSubmission
    hackathon.TeamService/ListSubmissions
    vote.VoteService/CreateVoteCategory
    vote.VoteService/SubmitVote
    vote.VoteService/ListVoteResults
    vote.VoteService/CreateVoteResult
    vote.VoteService/ExportVotes
    hackathon.HackathonService/EditSettings
    hackathon.HackathonService/SubmitRegistrationForm
    hackathon.ConfigService/SetRegistrationForm
    hackathon.ConfigService/SetSubmissionForm
    hackathon.ConfigService/SetVotingPolicy
    hackathon.ConfigService/SetWindows
    hackathon.ConfigService/OverrideWindow
    hackathon.PrizeService/Set
    hackathon.PrizeService/Finalize
    hackathon.PrizeService/Edit
)

if ! grpcurl -plaintext "$GRPC_ADDR" list >/dev/null 2>&1; then
    echo "error: backend not reachable at $GRPC_ADDR (is the stack up?)" >&2
    exit 1
fi

mkdir -p "$STATE_DIR"
OUT="$STATE_DIR/capabilities.json"

echo "==> Probing backend capabilities at $GRPC_ADDR..."
{
    printf '{\n'
    printf '  "generatedAt": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  "grpcAddr": "%s",\n' "$GRPC_ADDR"
    printf '  "methods": {\n'
    first=1
    for m in "${METHODS[@]}"; do
        out=$(grpcurl -plaintext -d '{}' "$GRPC_ADDR" "$m" 2>&1 || true)
        impl=true
        case "$out" in
        *"Code: Unimplemented"* | *"code = Unimplemented"*) impl=false ;;
        *"does not expose service"* | *"does not include a method"* | \
            *"Failed to resolve symbol"* | *"unknown service"* | *"no such service"*)
            impl=false
            ;;
        *"Failed to dial"* | *"connection refused"*)
            echo "error: lost connection to backend while probing $m" >&2
            exit 1
            ;;
        esac
        [ $first -eq 1 ] || printf ',\n'
        first=0
        printf '    "%s": %s' "$m" "$impl"
        if [ "$impl" = true ]; then
            echo "  [x] $m" >&2
        else
            echo "  [ ] $m" >&2
        fi
    done
    printf '\n  }\n}\n'
} >"$OUT"

echo "==> Capabilities written to $OUT"
