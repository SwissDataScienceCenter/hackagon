import path from "path"
import fs from "fs"
import yaml from "yaml"
import { z, type ZodSchema } from "zod"
import { logger } from "$lib/server/logger"
import {
  secretsFileSchema,
  settingsFileSchema,
  AppConfigSchema,
} from "$lib/schemas/config-schema"
import { FileReadError, ParseError, ValidationError } from "./errors"

export type AppConfig = z.infer<typeof AppConfigSchema>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}

/**
 * Overlay `overlay` onto `base`, recursing into plain objects and replacing
 * everything else (scalars, arrays, dates).
 *
 * Deep, not shallow, and that is the whole point: the overlay is a PARTIAL.
 * `{ oidc: { issuer } }` must change the issuer and leave `clientId` and
 * `audience` alone — a spread at the top level would drop them and the config
 * would fail validation for a key nobody touched.
 *
 * Exported for the unit test; the loader is the only production caller.
 */
export function mergeConfig(base: unknown, overlay: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overlay)) return overlay

  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    // YAML can name a key `__proto__`; assigning it would mutate the
    // prototype chain rather than the object. This is a local file written by
    // whoever runs the app, but "config parsing cannot corrupt objects" is
    // cheaper to guarantee than to reason about.
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      continue
    merged[key] = key in merged ? mergeConfig(merged[key], value) : value
  }

  return merged
}

export class ConfigLoader {
  private config: AppConfig | null = null

  /**
   * Loads and validates settings.
   * In tests, you can call this with specific test paths.
   *
   * Precedence, lowest first:
   *
   *   config.yaml  <  config.local.yaml  <  secrets.yaml (oidc secrets only)
   *
   * `config.local.yaml` is gitignored, optional and partial — absent is the
   * normal case and changes nothing. It exists so machine-specific wiring
   * never edits a TRACKED file: the Cloudflare quick tunnel
   * (.claude/skills/cloudflare-tunnel) used to rewrite `oidc.issuer` in
   * config.yaml itself, so while a tunnel was wired the working tree differed
   * from HEAD and a `git add -A` committed a hostname that dies with the
   * tunnel. It writes the overlay now. The merged result is validated by the
   * same schema as the base, so the overlay is not a way in for an invalid
   * config.
   */
  public load(configDir?: string) {
    // If already loaded, return cached version
    if (this.config) {
      return this.config
    }

    const configPath = configDir
      ? path.resolve(process.cwd(), configDir)
      : path.resolve(process.cwd(), "config")

    const settingsPath = path.resolve(configPath, "config.yaml")
    const localPath = path.resolve(configPath, "config.local.yaml")
    const secretsPath = path.resolve(configPath, "secrets.yaml")

    const rawSettings = this.readAndParseYaml(settingsPath, "settings")
    const rawLocal = this.readOptionalYaml(localPath, "local settings overlay")
    const rawSecrets = this.readAndParseYaml(secretsPath, "secrets")

    const rawMerged =
      rawLocal === null ? rawSettings : mergeConfig(rawSettings, rawLocal)

    // 1. Validate individual files first to get clean objects
    const loadedSecrets = this.validateConfig(
      rawSecrets,
      secretsFileSchema,
      `secrets file in ${secretsPath}`,
    )

    const loadedSettings = this.validateConfig(
      rawMerged,
      settingsFileSchema,
      rawLocal === null
        ? `settings file in ${settingsPath}`
        : `settings file in ${settingsPath} overlaid with ${localPath}`,
    )

    // Merge safely
    const mergedConfig = {
      ...loadedSettings,
      oidc: {
        // Merge existing OIDC settings with secrets
        ...(loadedSettings.oidc || {}),
        clientSecret: loadedSecrets.oidc.clientSecret,
        authSecret: loadedSecrets.oidc.authSecret,
      },
      log: (loadedSettings.log ?? { forceDevLog: false }) as {
        forceDevLog: boolean
      },
    }

    // Validation against the complete AppConfigSchema
    this.config = this.validateConfig(
      mergedConfig,
      AppConfigSchema,
      "combined application configuration",
    ) as AppConfig

    logger.info(`Configuration loaded and validated successfully.`)
  }

  /**
   * Returns the config, null if not loaded.
   */
  public get(): AppConfig {
    if (!this.config) {
      throw new Error("Config not loaded. Call load() first.")
    }
    return this.config
  }

  // --- Helpers ---

  /**
   * Same as readAndParseYaml, but a missing file is `null` rather than an
   * error. ONLY a missing file: a present-but-unreadable or malformed overlay
   * still throws, because silently ignoring it means the operator's override
   * stops applying and nothing says so.
   */
  private readOptionalYaml(filePath: string, fileType: string): unknown | null {
    if (!fs.existsSync(filePath)) return null

    logger.info(`Applying optional ${fileType} '${filePath}'`)

    return this.readAndParseYaml(filePath, fileType)
  }

  private readAndParseYaml(filePath: string, fileType: string): unknown {
    logger.info(`Reading file '${filePath}'`)
    let content: string
    try {
      content = fs.readFileSync(filePath, "utf8")
    } catch {
      throw new FileReadError(
        `Failed to read ${fileType} file ${filePath}`,
        filePath,
      )
    }

    try {
      const parsed = yaml.parse(content)
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Content is not a valid object.")
      }

      return parsed
    } catch (error: unknown) {
      const message =
        error instanceof yaml.YAMLError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Invalid YAML syntax"
      throw new ParseError(message, filePath)
    }
  }

  private validateConfig<T>(
    data: unknown,
    schema: ZodSchema<T>,
    contextMessage: string,
  ): T {
    const validation = schema.safeParse(data)

    if (!validation.success) {
      const rawErrors = validation.error.errors

      const formattedIssues = rawErrors.map((e) => {
        const path = e.path.join(".")
        return `${path || "(Root)"}: ${e.message}`
      })

      throw new ValidationError(
        `Invalid ${contextMessage} validation failed`,
        formattedIssues,
      )
    }

    return validation.data
  }
}
