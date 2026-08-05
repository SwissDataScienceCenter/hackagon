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

export class ConfigLoader {
  private config: AppConfig | null = null

  /**
   * Loads and validates settings.
   * In tests, you can call this with specific test paths.
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
    const secretsPath = path.resolve(configPath, "secrets.yaml")

    const rawSettings = this.readAndParseYaml(settingsPath, "settings")
    const rawSecrets = this.readAndParseYaml(secretsPath, "secrets")

    // 1. Validate individual files first to get clean objects
    const loadedSecrets = this.validateConfig(
      rawSecrets,
      secretsFileSchema,
      `secrets file in ${secretsPath}`,
    )

    const loadedSettings = this.validateConfig(
      rawSettings,
      settingsFileSchema,
      `settings file in ${settingsPath}`,
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
