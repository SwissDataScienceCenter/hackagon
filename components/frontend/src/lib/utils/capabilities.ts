/**
 * What a member is allowed to do in a hackathon right now.
 *
 * The gate is always a server-side toggle — never a date. Phases describe when a
 * capability is *expected* to change, for display; they never open anything. A
 * wrong date can therefore only produce a wrong countdown, never an unauthorised
 * action. See `.claude/plans/phase-engine.md`.
 *
 * This module is deliberately pure and structurally typed: `$lib/server/**` must
 * never reach a component, so it takes plain shapes rather than generated gRPC
 * types.
 */

export type Capability =
  | "register"
  | "submit_proposal"
  | "set_team_preferences"
  | "submit_project"
  | "vote"
  | "view_results"

export const CAPABILITIES: readonly Capability[] = [
  "register",
  "submit_proposal",
  "set_team_preferences",
  "submit_project",
  "vote",
  "view_results",
] as const

/**
 * - `open` / `closed` — a real toggle says so.
 * - `coming` — closed now, but a phase schedules it to open. Not reachable yet:
 *   nothing links capabilities to phases until the phase-link step.
 * - `ungoverned` — no backend gate exists for this capability yet, so the engine
 *   has **no opinion**: render exactly as you did before this module existed.
 *   This is what keeps partial adoption safe. Only `register` and `vote` have a
 *   gate today; the other four would otherwise read as `closed` and their CTAs
 *   would vanish.
 */
export type CapabilityState = "open" | "closed" | "coming" | "ungoverned"

/** Mirrors `hackathon.entities.HackathonSettings`, which is Get-only. */
export interface HackathonSettingsRef {
  registrationsEnabled: boolean
  votingEnabled: boolean
}

export interface CapabilityInput {
  /**
   * Absent for every hackathon created before the settings table existed — the
   * row is only written by `Create`, and there is no backfill. Those hackathons
   * genuinely cannot be joined (the backend fails the mutation), so treating
   * absent settings as `closed` is accurate rather than merely cautious.
   */
  settings?: HackathonSettingsRef | null
}

export type CapabilityStates = Record<Capability, CapabilityState>

function governed(enabled: boolean): CapabilityState {
  return enabled ? "open" : "closed"
}

/**
 * Resolve every capability at once, so no caller has to remember which ones
 * currently have a backend gate and which are still `ungoverned`.
 */
export function resolveCapabilities(input: CapabilityInput): CapabilityStates {
  const settings = input.settings

  return {
    // Enforced in HackathonService.Join.
    register: settings ? governed(settings.registrationsEnabled) : "closed",
    // The flag exists and is honoured here, but VoteService is not implemented,
    // so there is no voting UI to reach yet even when this resolves to `open`.
    vote: settings ? governed(settings.votingEnabled) : "closed",
    // No toggle behind these yet — see the `ungoverned` note above.
    submit_proposal: "ungoverned",
    set_team_preferences: "ungoverned",
    submit_project: "ungoverned",
    view_results: "ungoverned",
  }
}

/**
 * Whether the action should work for the viewer.
 *
 * Collapsing the four states to a boolean belongs here rather than at each call
 * site, because the easy mistake is `state === "open"` — which silently disables
 * every capability that has no toggle yet.
 */
export function isAvailable(state: CapabilityState): boolean {
  return state === "open" || state === "ungoverned"
}

/**
 * Whether to explain the absence to the member. `ungoverned` is excluded on
 * purpose: there is nothing to explain when the engine has no opinion.
 */
export function isBlocked(state: CapabilityState): boolean {
  return state === "closed" || state === "coming"
}
