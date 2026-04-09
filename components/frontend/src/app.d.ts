// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Logger } from "pino"
import type { AppConfig } from "$lib/server/settings"
import type { AuthClient } from "$lib/api/client"

declare global {
  namespace App {
    // interface Error {}
    export interface Locals {
      config: AppConfig
      user?: {
        id: string
        username: string
        roles: string[]
      }
      logger: Logger
      authClient: AuthClient
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
