// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Logger } from "pino"
import type { AppConfig } from "$lib/server/settings"
import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import type { Session } from "@auth/core/types"

declare global {
  namespace App {
    // interface Error {}
    export interface Locals {
      config: AppConfig
      session?: Omit<Session, "accessToken">
      logger: Logger
      grpc?: AuthorizedGrpc
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
