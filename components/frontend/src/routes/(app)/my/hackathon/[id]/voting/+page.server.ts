import type { Actions, PageServerLoad } from "./$types"
import type { ActionFailure, Cookies } from "@sveltejs/kit"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The voting phase end to end: organizers shape the categories and publish the
// placements, participants cast one ballot per category, everyone reads the
// results.
//
// Every rule below is enforced in vote_service.go — who may vote, whether
// voting is open, and the one-ballot-per-(category, voter) unique index. This
// route only asks and translates the answer; it never decides.

/** VotingMethod: SINGLE_CHOICE=1, RANKED=2, POINTS=3 */
const VOTING_METHOD_LABEL: Partial<Record<number, string>> = {
    1: "Single choice",
    2: "Ranked",
    3: "Points",
}

/** VoterType: ALL_PARTICIPANTS=1, JURY=2 */
const VOTER_TYPE_LABEL: Partial<Record<number, string>> = {
    1: "All participants",
    2: "Jury only",
}
const VOTER_TYPE_JURY = 2

/** SubmissionStatus: DRAFT=1, FINAL=2 */
const SUBMISSION_STATUS_LABEL: Partial<Record<number, string>> = {
    1: "draft",
    2: "final",
}

/** ExportFormat: CSV=1, JSON=2 */
const EXPORT_CSV = 1
const EXPORT_JSON = 2

/** HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2 */
const HACKATHON_ROLE_OWNER = 1

/** Every action answers with this one shape, so `form?.x` stays typed. */
type VotingForm = {
    message?: string
    /** Category whose ballot was just accepted. */
    castIn?: string
    /** Category the caller had already voted in (ALREADY_EXISTS). */
    alreadyVotedIn?: string
    /** A payload to copy or download, produced by the export actions. */
    exported?: { title: string; filename: string; text: string }
    done?: string
}

function ok(data: VotingForm): VotingForm {
    return data
}

function bad(status: number, data: VotingForm): ActionFailure<VotingForm> {
    return fail(status, data)
}

/** Maps a gRPC failure onto a form error, rethrowing anything unexpected. */
function formError(e: unknown): ActionFailure<VotingForm> {
    if (e instanceof ClientError) {
        if (e.code === Status.PERMISSION_DENIED)
            return bad(403, { message: e.details || "You are not allowed to do that." })
        if (e.code === Status.UNAUTHENTICATED) return bad(401, { message: "Please sign in again." })
        if (e.code === Status.NOT_FOUND) return bad(404, { message: "That item no longer exists." })
        if (e.code === Status.ALREADY_EXISTS) return bad(409, { message: "That already exists." })
        if (e.code === Status.FAILED_PRECONDITION)
            return bad(409, { message: e.details || "That isn't possible right now." })
        // The vote service answers bad input with InvalidArgument and never with
        // Unimplemented, which the e2e capability probe reads as "the RPC does
        // not exist" — so a 400 here really is bad input, not a missing feature.
        if (e.code === Status.INVALID_ARGUMENT)
            return bad(400, { message: e.details || "That input was rejected." })
        if (e.code === Status.UNIMPLEMENTED)
            return bad(501, { message: "This server does not run the voting service yet." })
    }
    throw e
}

// Only organizers may list ballots, so a voter cannot ask the server "what did
// I vote?" — the id handed back when the ballot was accepted is remembered here
// instead. The cookie is a lookup hint and never an authorization: GetVote is
// what actually returns the ballot, and its voter must match the reader.
const BALLOT_COOKIE = "hackagon_ballots"
const BALLOT_COOKIE_MAX = 40

function readBallots(cookies: Cookies): Record<string, string> {
    const raw = cookies.get(BALLOT_COOKIE)
    if (!raw) return {}
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

        return parsed as Record<string, string>
    } catch {
        return {}
    }
}

function rememberBallot(cookies: Cookies, categoryId: string, voteId: string) {
    const entries = Object.entries(readBallots(cookies)).filter(([k]) => k !== categoryId)
    entries.push([categoryId, voteId])
    cookies.set(BALLOT_COOKIE, JSON.stringify(Object.fromEntries(entries.slice(-BALLOT_COOKIE_MAX))), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 90,
    })
}

/** Structural shapes, so this file does not depend on the generated types. */
type Category = {
    id: string
    name: string
    description: string
    votingMethod: number
    voterType: number
    juryMembers: { id: string; displayName: string; username: string }[]
}
type VoteResult = {
    id: string
    submissionId: string
    position: number
    title?: string | undefined
}
type Ballot = {
    id: string
    categoryId: string
    voterId: string
    singleChoice?: { submissionId: string } | undefined
}

function safeName(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "export"
}

export const load: PageServerLoad = async (event) => {
    const { vote, team } = requireGrpc(event.locals.grpc)
    const { hackathon, myMembership } = await event.parent()
    const hackathonId = event.params.id
    const myUserId = event.locals.platformUser?.id ?? ""

    // The parent layout's Get only admits confirmed participants, hackathon
    // owners and global admins — so a viewer who reached this page with no
    // membership row at all is an admin looking in.
    const isOrganizer = !myMembership || myMembership.role === HACKATHON_ROLE_OWNER

    let categories: Category[] = []
    let serviceAvailable = true
    try {
        const res = await vote.listVoteCategories({ hackathonId })
        categories = res.voteCategories
    } catch (e) {
        if (e instanceof ClientError && e.code === Status.UNIMPLEMENTED) serviceAvailable = false
        else if (
            e instanceof ClientError &&
            (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
        )
            categories = []
        else throw e
    }

    // Ballots point at submissions, and there is no per-hackathon submission
    // listing — teams carry them one team at a time. Members are allowed to read
    // every team's submissions precisely so that they can vote on them.
    const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))
    let submissions: { id: string; label: string; status: string }[] = []
    try {
        const { teams } = await team.list({ hackathonId })
        const perTeam = await Promise.all(
            teams.map(async (t) => {
                const res = await team.listSubmissions({ teamId: t.id })

                return res.submissions.map((s) => {
                    const project = projectTitles.get(s.projectId) ?? ""

                    return {
                        id: s.id,
                        label: project
                            ? `${project} · ${t.name} · v${s.version}`
                            : `${t.name} · v${s.version}`,
                        status: SUBMISSION_STATUS_LABEL[s.status] ?? "unknown",
                    }
                })
            }),
        )
        submissions = perTeam.flat()
    } catch (e) {
        if (
            !(
                e instanceof ClientError &&
                (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
            )
        ) {
            throw e
        }
    }
    const submissionLabels = new Map(submissions.map((s) => [s.id, s.label]))
    const labelFor = (id: string) => submissionLabels.get(id) ?? "Unknown submission"

    const remembered = readBallots(event.cookies)

    async function resultsFor(categoryId: string): Promise<VoteResult[]> {
        try {
            const res = await vote.listVoteResults({ categoryId })

            return res.voteResults
        } catch (e) {
            if (e instanceof ClientError) return []
            throw e
        }
    }

    // ListVotes needs voter_id and submission_id to be UUIDs even when they are
    // meant as "no filter", so the tally is read from the export instead — the
    // same organizer-only gate, one call, already shaped as rows.
    async function tallyFor(categoryId: string) {
        try {
            const res = await vote.exportVotes({ categoryId, format: EXPORT_JSON })
            const rows: unknown = JSON.parse(new TextDecoder().decode(res.data) || "[]")
            if (!Array.isArray(rows)) return []
            const counts = new Map<string, number>()
            for (const row of rows as { submission_id?: string }[]) {
                const id = row.submission_id ?? ""
                if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
            }

            return [...counts]
                .map(([submissionId, votes]) => ({
                    submissionId,
                    label: labelFor(submissionId),
                    votes,
                }))
                .sort((a, b) => b.votes - a.votes)
        } catch (e) {
            if (e instanceof ClientError) return []
            throw e
        }
    }

    async function myBallotFor(categoryId: string): Promise<string> {
        const voteId = remembered[categoryId]
        if (!voteId) return ""
        try {
            const res = await vote.getVote({ id: voteId })
            const ballot: Ballot | undefined = res.vote
            // A shared browser could carry someone else's hint; the server's
            // answer is what decides whose ballot this is.
            if (!ballot || ballot.voterId !== myUserId) return ""

            return ballot.singleChoice?.submissionId ?? ""
        } catch (e) {
            if (e instanceof ClientError) return ""
            throw e
        }
    }

    const detailed = await Promise.all(
        categories.map(async (c) => {
            const [results, tally, myVoteSubmissionId] = await Promise.all([
                resultsFor(c.id),
                isOrganizer ? tallyFor(c.id) : Promise.resolve([]),
                isOrganizer ? Promise.resolve("") : myBallotFor(c.id),
            ])

            return {
                id: c.id,
                name: c.name,
                description: c.description ?? "",
                votingMethod: c.votingMethod,
                methodLabel: VOTING_METHOD_LABEL[c.votingMethod] ?? "Unknown",
                voterType: c.voterType,
                voterTypeLabel: VOTER_TYPE_LABEL[c.voterType] ?? "Unknown",
                isJuryOnly: c.voterType === VOTER_TYPE_JURY,
                juryMemberIds: c.juryMembers.map((u) => u.id),
                juryNames: c.juryMembers.map((u) => u.displayName || u.username),
                results: results.map((r) => ({
                    id: r.id,
                    position: r.position,
                    title: r.title ?? "",
                    submissionId: r.submissionId,
                    submissionLabel: labelFor(r.submissionId),
                })),
                tally,
                myVoteSubmissionId,
                myVoteLabel: myVoteSubmissionId ? labelFor(myVoteSubmissionId) : "",
            }
        }),
    )

    return {
        serviceAvailable,
        isOrganizer,
        // Prefilled from the entity, because SetVotingPolicy replaces the whole
        // record — the same trap GetWindows, PrizeService.Get and
        // GetEmailTemplates each exist to avoid. It rides on the hackathon
        // rather than behind a read RPC because these are the rules the voters
        // are bound by, not an organiser's private setting.
        policy: {
            ownTeamVoting: hackathon.votingPolicy?.ownTeamVoting ?? true,
            organizerVoting: hackathon.votingPolicy?.organizerVoting ?? false,
            mechanism: hackathon.votingPolicy?.mechanism || "single_choice",
            oneBallotPer: hackathon.votingPolicy?.oneBallotPer || "category",
            tieBreak: hackathon.votingPolicy?.tieBreak ?? [],
        },
        // Authoritative: SubmitVote reads this very flag before accepting a ballot.
        votingOpen: hackathon.settings?.votingEnabled ?? false,
        isWaiting: myMembership?.isWaiting ?? false,
        categories: detailed,
        submissions,
        members: hackathon.members
            .filter((m) => m.user)
            .map((m) => ({
                id: m.user?.id ?? "",
                name: m.user?.displayName || m.user?.username || "",
            })),
    }
}

export const actions: Actions = {
    // Opening and closing the ballot.
    //
    // `settings.votingEnabled` gates every SubmitVote and defaults to FALSE, and
    // nothing in the UI could set it: the vote — the act the whole event builds
    // to — was openable only over grpcurl. HackathonService.EditSettings is the
    // RPC that does it and had no caller anywhere.
    //
    // Deliberately does not touch `registrationsEnabled`, the other field on
    // that request: it is enforced nowhere (audit B3, two contradictory
    // registration gates) and the `register` capability governs instead.
    // Offering a switch that does nothing is worse than offering none.
    setVotingOpen: async (event) => {
        const { hackathon } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()

        try {
            await hackathon.editSettings({
                hackathonId: event.params.id,
                votingEnabled: form.get("votingEnabled") === "on",
            })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: form.get("votingEnabled") === "on" ? "Voting is open." : "Voting is closed." })
    },

    // The rules of the vote. Until this existed the policy was write-only in
    // both directions: nothing set it, and SubmitVote ignored what was there.
    setPolicy: async (event) => {
        const { config } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()

        try {
            await config.setVotingPolicy({
                hackathonId: event.params.id,
                // Documented, not enforced: one vote per category is the only
                // mechanism implemented, so these two are recorded as the
                // organiser's ruling rather than offered as choices.
                mechanism: "single_choice",
                oneBallotPer: "category",
                ownTeamVoting: form.get("ownTeamVoting") === "on",
                organizerVoting: form.get("organizerVoting") === "on",
                tieBreak: String(form.get("tieBreak") ?? "")
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
            })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: "Voting rules saved." })
    },

    createCategory: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const name = String(form.get("name") ?? "").trim()
        if (name.length < 3) return bad(400, { message: "A category name needs three characters." })
        try {
            await vote.createVoteCategory({
                hackathonId: event.params.id,
                name,
                description: String(form.get("description") ?? "").trim(),
                votingMethod: Number(form.get("votingMethod") ?? 0),
                voterType: Number(form.get("voterType") ?? 0),
                juryMemberIds: form.getAll("juryMemberIds").map(String).filter(Boolean),
            })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: `Category "${name}" created.` })
    },

    editCategory: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const id = String(form.get("categoryId") ?? "")
        if (!id) return bad(400, { message: "Missing category." })
        try {
            await vote.editVoteCategory({
                id,
                name: String(form.get("name") ?? ""),
                description: String(form.get("description") ?? ""),
                votingMethod: Number(form.get("votingMethod") ?? 0) || undefined,
                voterType: Number(form.get("voterType") ?? 0) || undefined,
                // An empty list leaves the jury untouched — proto3 cannot tell
                // "no jury" from "field absent" on a repeated field.
                juryMemberIds: form.getAll("juryMemberIds").map(String).filter(Boolean),
            })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: "Category saved." })
    },

    deleteCategory: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const id = String(form.get("categoryId") ?? "")
        if (!id) return bad(400, { message: "Missing category." })
        try {
            await vote.deleteVoteCategory({ id })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: "Category deleted." })
    },

    castBallot: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const categoryId = String(form.get("categoryId") ?? "")
        const submissionId = String(form.get("submissionId") ?? "")
        if (!categoryId) return bad(400, { message: "Missing category." })
        if (!submissionId) return bad(400, { message: "Pick a submission first." })
        try {
            // Only single_choice ballots are accepted today; ranked and points
            // categories exist but SubmitVote rejects those payloads.
            const res = await vote.submitVote({ singleChoice: { categoryId, submissionId } })
            if (res.vote?.id) rememberBallot(event.cookies, categoryId, res.vote.id)
        } catch (e) {
            if (e instanceof ClientError && e.code === Status.ALREADY_EXISTS) {
                return bad(409, {
                    alreadyVotedIn: categoryId,
                    message: "You have already voted in this category. Ballots are final.",
                })
            }
            if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
                return bad(409, { message: "Voting is not open for this hackathon." })
            }
            return formError(e)
        }

        return ok({ castIn: categoryId, done: "Your ballot was recorded." })
    },

    createResult: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const categoryId = String(form.get("categoryId") ?? "")
        const submissionId = String(form.get("submissionId") ?? "")
        if (!categoryId) return bad(400, { message: "Missing category." })
        if (!submissionId) return bad(400, { message: "Pick the submission to place." })
        const title = String(form.get("title") ?? "").trim()
        try {
            await vote.createVoteResult({
                categoryId,
                submissionId,
                position: Number(form.get("position") ?? 1) || 1,
                title: title || undefined,
            })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: "Placement recorded." })
    },

    editResult: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const id = String(form.get("resultId") ?? "")
        if (!id) return bad(400, { message: "Missing placement." })
        const title = String(form.get("title") ?? "").trim()
        try {
            await vote.editVoteResult({
                id,
                submissionId: String(form.get("submissionId") ?? "") || undefined,
                position: Number(form.get("position") ?? 0) || undefined,
                title: title || undefined,
            })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: "Placement saved." })
    },

    deleteResult: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const id = String(form.get("resultId") ?? "")
        if (!id) return bad(400, { message: "Missing placement." })
        try {
            await vote.deleteVoteResult({ id })
        } catch (e) {
            return formError(e)
        }

        return ok({ done: "Placement removed." })
    },

    exportVotes: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const categoryId = String(form.get("categoryId") ?? "")
        if (!categoryId) return bad(400, { message: "Missing category." })
        const json = String(form.get("format") ?? "json") === "json"
        let res
        try {
            res = await vote.exportVotes({ categoryId, format: json ? EXPORT_JSON : EXPORT_CSV })
        } catch (e) {
            return formError(e)
        }
        const name = safeName(String(form.get("categoryName") ?? "category"))

        return ok({
            exported: {
                title: `Ballots · ${String(form.get("categoryName") ?? "")}`,
                filename: `votes-${name}.${json ? "json" : "csv"}`,
                text: new TextDecoder().decode(res.data),
            },
        })
    },

    exportResults: async (event) => {
        const { vote } = requireGrpc(event.locals.grpc)
        const form = await event.request.formData()
        const categoryId = String(form.get("categoryId") ?? "")
        if (!categoryId) return bad(400, { message: "Missing category." })
        const json = String(form.get("format") ?? "json") === "json"
        let res
        try {
            res = await vote.exportResults({ categoryId, format: json ? EXPORT_JSON : EXPORT_CSV })
        } catch (e) {
            return formError(e)
        }
        const name = safeName(String(form.get("categoryName") ?? "category"))

        return ok({
            exported: {
                title: `Results · ${String(form.get("categoryName") ?? "")}`,
                filename: `results-${name}.${json ? "json" : "csv"}`,
                text: new TextDecoder().decode(res.data),
            },
        })
    },
}
