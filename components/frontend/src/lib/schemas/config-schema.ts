import { z } from "zod"

// Session replay (OpenReplay). OFF unless a `replay:` block in config.yaml
// says otherwise — an absent block parses to `{ enabled: false }`, so a
// deployment that has never heard of this feature cannot start recording
// because somebody forgot a flag. Same discipline as the backend's RPC
// journal (docs/backend/rpc-journal.md).
//
// WHAT ENABLING IT COLLECTS, from every visitor's browser, for every page:
// the DOM and its mutations, mouse movement, clicks (with the CSS path of the
// clicked element), scrolls, viewport size, page navigations, and the
// browser's own resource timings — streamed to `ingestPoint`, a third-party
// service unless you host it yourself. Page text, input values, console output
// and network headers are masked before they leave the page. URLs and
// attribute values are NOT: they carry ids and structure, so keep personal
// data out of both. The masking is configured in `SessionReplay.svelte` and
// asserted by `tests/openreplay/masking.spec.ts`.
//
// It is deliberately NOT correlated with the RPC journal: no session id,
// replay id or user id is sent to the backend, and the tracker is never told
// who the visitor is.
const replaySchema = z
  .object({
    enabled: z.boolean().default(false),
    // Where the tracker posts. Self-hosted OpenReplay puts this at
    // `<public-url>/ingest`.
    ingestPoint: z.string().url("replay.ingestPoint must be a URL").optional(),
    // Identifies the OpenReplay project; read out of its UI/API, not a secret
    // (it ships to every browser) but not a thing to guess either.
    projectKey: z.string().min(1).optional(),
    // The tracker refuses to record a page served over plain http, because a
    // replay of a site the outside world cannot fetch assets from is mostly
    // useless. Dev and the e2e stack are http://localhost, so the check has
    // to be defeatable — but only on purpose, never as a silent fallback.
    allowInsecureOrigin: z.boolean().default(false),
  })
  .refine((r) => !r.enabled || (!!r.ingestPoint && !!r.projectKey), {
    message: "replay.enabled requires replay.ingestPoint and replay.projectKey",
  })
  .default({})

// Audience measurement (Plausible). OFF unless a `plausible:` block says
// otherwise, exactly like `replay` above and for the same reason: a deployment
// that has never heard of this feature must not start counting because
// somebody forgot a flag. Absent block ⇒ no script tag, no request, nothing in
// the console.
//
// WHAT ENABLING IT COLLECTS, per page view: the ROUTE TEMPLATE (never the URL —
// see $lib/utils/analyticsRoute), the referrer's origin, screen width, and
// whatever Plausible derives server-side from the request (browser, OS,
// country if a geolocation database is configured — this dev rig ships none).
// No cookie, no localStorage, no identifier of any kind is stored in the
// browser.
//
// WHAT PLAUSIBLE ITSELF DOES WITH THE REQUEST: to count a visitor twice in one
// day without an identifier, it computes a hash of (daily-rotated salt, IP
// address, user agent, site domain) and stores ONLY that hash — verified
// against the schema, not the marketing page: `plausible_events_db.events_v2`
// has a `user_id UInt64` and no column of any kind holding an IP or a user
// agent. The salt rotates every day, so the same person is a different number
// tomorrow. That is still processing of an IP address in transit, and
// docs/frontend/analytics.md says so out loud rather than calling it
// "anonymous".
//
// It is deliberately NOT correlated with the RPC journal or with session
// replay: nothing joins these numbers to a user id, and no replay session id
// is ever sent here.
const plausibleSchema = z
  .object({
    enabled: z.boolean().default(false),
    // The tracker script, served by the Plausible instance itself. The script
    // derives its own ingest endpoint from this URL's origin, so one setting
    // points at both. Wiring writes the `…local.manual.js` variant on purpose
    // (see PlausibleAnalytics.svelte).
    scriptUrl: z.string().url("plausible.scriptUrl must be a URL").optional(),
    // The site to attribute events to — must equal the domain registered in
    // Plausible EXACTLY, and it is a label rather than a hostname: nothing
    // resolves it.
    domain: z.string().min(1).optional(),
  })
  .refine((p) => !p.enabled || (!!p.scriptUrl && !!p.domain), {
    message: "plausible.enabled requires plausible.scriptUrl and plausible.domain",
  })
  .default({})

// Secrets File Schema for Validation
export const secretsFileSchema = z.object({
  oidc: z.object({
    clientSecret: z
      .string()
      .min(1, "OIDC Client Secret cannot be empty in secrets file"),
    authSecret: z
      .string()
      .min(1, "Auth Secret cannot be empty in secrets file"),
  }),
})

// Settings File Schema for Validation
export const settingsFileSchema = z.object({
  log: z
    .object({
      forceDevLog: z.boolean(),
    })
    .default({ forceDevLog: false }),
  backend: z.object({
    hostname: z
      .string()
      .min(1, "Backend hostname cannot be empty (check settings YAML)"),
    port: z
      .number()
      .int()
      .positive(
        "Backend port must be a positive integer (check settings YAML)",
      ),
  }),
  oidc: z.object({
    clientId: z
      .string()
      .min(1, "OIDC Client ID cannot be empty (check settings YAML)"),
    issuer: z
      .string()
      .url("OIDC Issuer must be a valid URL (check settings YAML)"),
    audience: z
      .string()
      .min(1, "OIDC Audience cannot be empty (check settings YAML)"),
  }),
  cookies: z.object({ useSecure: z.boolean() }),
  replay: replaySchema,
  plausible: plausibleSchema,
})

// App Config Schema
export const AppConfigSchema = z.object({
  log: z
    .object({
      forceDevLog: z.boolean(),
    })
    .default({ forceDevLog: false }),
  backend: z.object({
    hostname: z
      .string()
      .min(1, "Backend hostname cannot be empty (check settings YAML)"),
    port: z
      .number()
      .int()
      .positive(
        "Backend port must be a positive integer (check settings YAML)",
      ),
  }),
  oidc: z.object({
    clientId: z
      .string()
      .min(1, "OIDC Client ID cannot be empty (check settings YAML)"),
    clientSecret: z
      .string()
      .min(1, "OIDC Client Secret cannot be empty (check secrets YAML)"),
    issuer: z
      .string()
      .url("OIDC Issuer must be a valid URL (check settings YAML)"),
    audience: z
      .string()
      .min(1, "OIDC Audience cannot be empty (check settings YAML)"),
    authSecret: z
      .string()
      .min(1, "Auth Secret cannot be empty (check secrets YAML)"),
  }),
  cookies: z.object({ useSecure: z.boolean() }),
  replay: replaySchema,
  plausible: plausibleSchema,
})
