import { z } from "zod"

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
})
