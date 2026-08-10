import { execFile, execFileSync } from "node:child_process"
import {
  GRPC_ADDR,
  KEYCLOAK,
  PERSONAS,
  type Credentials,
  type PersonaKey,
} from "../personas.js"

// Thin gRPC driver used by journey acts for lifecycle steps that have a
// backend RPC but no frontend UI yet ("API-driven act, UI-asserted outcome").
// Shells out to grpcurl (available in the Nix dev shell — same tool
// `just rpc::as` uses) with a real Keycloak password-grant token, so RBAC is
// exercised exactly as in production. Works for principals (personas.ts) and
// the extras crowd (cast.json) alike.

const tokenCache = new Map<string, string>()

export async function getTokenFor(creds: Credentials): Promise<string> {
  const cached = tokenCache.get(creds.username)
  if (cached) return cached
  const res = await fetch(KEYCLOAK.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: KEYCLOAK.clientId,
      username: creds.username,
      password: creds.password,
      grant_type: "password",
      scope: "openid profile",
    }),
  })
  if (!res.ok) {
    throw new Error(
      `Keycloak token request failed for ${creds.username}: ${res.status} ${await res.text()} — if this is an extra from cast.json, did scripts/roster.sh run?`,
    )
  }
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) {
    throw new Error(`No access_token in Keycloak response for ${creds.username}`)
  }
  tokenCache.set(creds.username, body.access_token)
  return body.access_token
}

export interface RpcResult {
  ok: boolean
  /** gRPC status code name on failure, e.g. "PermissionDenied", "Unauthenticated". */
  code?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
  raw: string
}

function runGrpcurl(method: string, data: unknown, token?: string): RpcResult {
  const args = [
    "-plaintext",
    ...(token ? ["-H", `authorization: Bearer ${token}`] : []),
    "-d",
    JSON.stringify(data ?? {}),
    GRPC_ADDR,
    method,
  ]
  try {
    const out = execFileSync("grpcurl", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    })
    return { ok: true, data: out.trim() ? JSON.parse(out) : {}, raw: out }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    const raw = `${err.stdout ?? ""}${err.stderr ?? ""}` || (err.message ?? "grpcurl failed")
    const m = raw.match(/Code:\s*(\w+)/)
    return { ok: false, code: m?.[1], raw }
  }
}

/**
 * Non-blocking grpcurl for the CONCURRENCY actions (`rpc.race`).
 *
 * `runGrpcurl` uses execFileSync, which blocks the event loop — a Promise.all
 * over it would fire the calls one after another and prove nothing about
 * simultaneity. This spawns each grpcurl detached and resolves when it exits,
 * so N calls genuinely overlap on the server. Tokens must be acquired BEFORE
 * the race (getTokenFor is memoized), or the first call's token round-trip
 * skews the start line.
 */
function runGrpcurlAsync(
  method: string,
  data: unknown,
  token?: string,
): Promise<RpcResult> {
  const args = [
    "-plaintext",
    ...(token ? ["-H", `authorization: Bearer ${token}`] : []),
    "-d",
    JSON.stringify(data ?? {}),
    GRPC_ADDR,
    method,
  ]
  return new Promise((resolve) => {
    execFile(
      "grpcurl",
      args,
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({
            ok: true,
            data: stdout.trim() ? JSON.parse(stdout) : {},
            raw: stdout,
          })
          return
        }
        const raw = `${stdout ?? ""}${stderr ?? ""}` || err.message
        const m = raw.match(/Code:\s*(\w+)/)
        resolve({ ok: false, code: m?.[1], raw })
      },
    )
  })
}

/** Async authenticated call — the `rpc.race` building block. */
export async function rpcAsUserAsync(
  creds: Credentials,
  method: string,
  data: unknown = {},
): Promise<RpcResult> {
  return runGrpcurlAsync(method, data, await getTokenFor(creds))
}

/** Async unauthenticated call. */
export function rpcAnonymousAsync(
  method: string,
  data: unknown = {},
): Promise<RpcResult> {
  return runGrpcurlAsync(method, data)
}

/** Unauthenticated call (backend injects anonymous claims). */
export function rpcAnonymous(method: string, data: unknown = {}): RpcResult {
  return runGrpcurl(method, data)
}

/** Authenticated call with explicit credentials (principals or extras). */
export async function rpcAsUser(
  creds: Credentials,
  method: string,
  data: unknown = {},
): Promise<RpcResult> {
  return runGrpcurl(method, data, await getTokenFor(creds))
}

/** Authenticated call as one of the four principal personas. */
export async function rpcAs(
  key: PersonaKey,
  method: string,
  data: unknown = {},
): Promise<RpcResult> {
  return rpcAsUser(PERSONAS[key], method, data)
}

/**
 * Make sure the user exists in the backend DB and return their DB UUID.
 * Principals get auto-registered by their browser login (auth.setup.ts); the
 * extras crowd never touches the frontend, so they self-register here — the
 * same Register RPC the frontend hooks call.
 */
export async function ensureRegistered(creds: Credentials): Promise<string> {
  let res = await rpcAsUser(creds, "user.UserService/WhoAmI", {})
  if (!res.ok && res.code === "NotFound") {
    const reg = await rpcAsUser(creds, "user.UserService/Register", {})
    if (!reg.ok) throw new Error(`Register failed for ${creds.username}: ${reg.raw}`)
    res = await rpcAsUser(creds, "user.UserService/WhoAmI", {})
  }
  const id: string | undefined = res.data?.user?.id
  if (!res.ok || !id) {
    throw new Error(`WhoAmI failed for ${creds.username}: ${res.raw}`)
  }
  return id
}

/** Resolve a principal persona's backend DB user UUID. */
export async function dbUserId(key: PersonaKey): Promise<string> {
  return ensureRegistered(PERSONAS[key])
}
