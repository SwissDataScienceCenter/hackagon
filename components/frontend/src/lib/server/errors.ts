/** Base class for configuration-related errors. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

/** Error for when a config file cannot be read. */
export class FileReadError extends ConfigError {
  constructor(
    message: string,
    public filePath: string,
  ) {
    super(message)
    this.name = "FileReadError"
  }
}

/** Error for when a YAML file is malformed. */
export class ParseError extends ConfigError {
  constructor(
    message: string,
    public filePath: string,
  ) {
    super(message)
    this.name = "ParseError"
  }
}

/** Error for when configuration validation fails. */
export class ValidationError extends ConfigError {
  constructor(
    message: string,
    public issues: string[],
  ) {
    super(message)
    this.name = "ValidationError"
  }
}

/** Error for when a session is present but token is missing/expired. */
export class ReauthenticationRequiredError extends Error {
  constructor(message = "Session requires re-authentication.") {
    super(message)
    this.name = "ReauthenticationRequiredError"
  }
}
