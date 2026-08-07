/**
 * The single gRPC channel to the backend.
 *
 * The address comes from config, which is only loaded once the server starts,
 * so the channel cannot be built at module-import time. It is created by
 * `initBackendChannel()` from hooks.server.ts before any request is served,
 * and every client — authorized, public and health — dials through it.
 */

import { createChannel } from "nice-grpc"
import type { AppConfig } from "$lib/server/settings"

let channel: ReturnType<typeof createChannel> | undefined
let currentTarget: string | undefined

/**
 * Point the backend channel at the configured address.
 *
 * Idempotent: re-running with the same address is a no-op, so the dev-reload
 * path in hooks.server.ts can call it on every request without leaking. A
 * changed address closes the previous channel before opening the new one.
 */
export function initBackendChannel(config: Pick<AppConfig, "backend">) {
  const target = `${config.backend.hostname}:${config.backend.port}`

  if (channel && currentTarget === target) {
    return
  }

  channel?.close()
  currentTarget = target
  channel = createChannel(target)
}

/**
 * The backend channel. Throws if config has not been wired yet — a loud
 * failure is deliberate here, because the quiet alternative is dialling a
 * default address and reporting the backend as down.
 */
export function backendChannel(): ReturnType<typeof createChannel> {
  if (!channel) {
    throw new Error(
      "Backend gRPC channel not initialised. Call initBackendChannel() first.",
    )
  }
  return channel
}
