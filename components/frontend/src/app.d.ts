// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Logger } from "pino"
import type { AppConfig } from "$lib/server/settings"
import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import type { Session } from "@auth/core/types"
import type { User } from "$lib/server/grpc/generated/user/entities/user"

declare global {
  /**
   * Build version, substituted by Vite's `define` (see vite.config.ts). Read it
   * through `$lib/version`, which guards the case where the define is absent.
   */
  const __APP_VERSION__: string

  namespace App {
    // interface Error {}
    export interface Locals {
      config: AppConfig
      session?: Omit<Session, "accessToken">
      logger: Logger
      grpc?: AuthorizedGrpc
      platformUser?: User
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
