import { render, screen } from "@testing-library/svelte"
import { describe, expect, it, vi } from "vitest"
import type { Session } from "@auth/sveltekit"

// `page` supplies the pathname the active-nav underline and the sign-in
// callbackUrl read; `afterNavigate` only closes the mobile panel.
vi.mock("$app/stores", async () => {
  const { writable } = await import("svelte/store")
  return { page: writable({ url: new URL("http://localhost/") }) }
})
vi.mock("$app/navigation", () => ({ afterNavigate: () => {} }))
vi.mock("@auth/sveltekit/client", () => ({
  signIn: () => {},
  signOut: () => {},
}))

import NavBar from "./NavBar.svelte"

const signedIn = {
  expires: "2099-01-01T00:00:00Z",
  user: { id: "u1", name: "Sabine Maennel" },
} as Omit<Session, "accessToken">

/*
 * What the bar claims about who you are. The server decides that — a session
 * whose token is dead never reaches here (see $lib/server/session) — so these
 * are the two shapes it can be handed, plus the reason it may carry alongside
 * the signed-out one.
 */
describe("NavBar", () => {
  it("names the user and offers Log out when signed in", () => {
    render(NavBar, { session: signedIn })

    expect(screen.getByText("Sabine Maennel")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Log in" })).toBeNull()
  })

  it("offers Log in and names nobody when signed out", () => {
    render(NavBar, { session: null })

    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull()
    expect(screen.queryByText("Session expired")).toBeNull()
  })

  // The visible half of the fix: a dead session arrives as no session, so the
  // bar must not offer Log out — and must say why the name went away, or the
  // sign-out looks like a second fault.
  it("says the session expired, and still offers only Log in", () => {
    render(NavBar, { session: null, sessionExpired: true })

    expect(screen.getByText("Session expired")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull()
  })
})
