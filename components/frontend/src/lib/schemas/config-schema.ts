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
})
