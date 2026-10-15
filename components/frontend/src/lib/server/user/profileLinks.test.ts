import { describe, expect, it } from "vitest"
import { ClientError, Status } from "nice-grpc-common"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import {
  editRequestFor,
  failForLinks,
  profileLinksFrom,
  profileLinksOf,
} from "./profileLinks"

const formOf = (fields: Record<string, string>) => {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  return form
}

const grpcError = (code: Status) =>
  new ClientError("/user.UserService/Edit", code, "invalid GitHub URL 'x'")

describe("profileLinksOf", () => {
  it("reads the rendered URLs off the user", () => {
    const user = {
      githubUrl: "https://github.com/octo",
      linkedinUrl: "",
      renkuUrl: "https://renkulab.io/u/jane",
    } as User

    expect(profileLinksOf(user)).toEqual({
      github: "https://github.com/octo",
      linkedin: "",
      renku: "https://renkulab.io/u/jane",
    })
  })

  // No platform user when the backend was down for WhoAmI.
  it("gives empty links for no user", () => {
    expect(profileLinksOf(undefined)).toEqual({
      github: "",
      linkedin: "",
      renku: "",
    })
  })
})

describe("profileLinksFrom", () => {
  it("trims what was typed", () => {
    const form = formOf({
      github: "  https://github.com/octo ",
      linkedin: "",
      renku: "\thttps://renkulab.io/u/jane\n",
    })

    expect(profileLinksFrom(form)).toEqual({
      github: "https://github.com/octo",
      linkedin: "",
      renku: "https://renkulab.io/u/jane",
    })
  })

  // The distinction the backend acts on: "" removes, undefined keeps.
  it("leaves a field the form did not post undefined, not empty", () => {
    const links = profileLinksFrom(formOf({ github: "" }))

    expect(links.github).toBe("")
    expect(links.linkedin).toBeUndefined()
    expect(links.renku).toBeUndefined()
  })
})

describe("editRequestFor", () => {
  it("sends an emptied box as an empty string, which removes the link", () => {
    expect(
      editRequestFor("u-1", {
        github: "",
        linkedin: "https://linkedin.com/in/jane",
        renku: "",
      }),
    ).toEqual({
      userId: "u-1",
      githubUrl: "",
      linkedinUrl: "https://linkedin.com/in/jane",
      renkuUrl: "",
    })
  })

  it("leaves out a link it was not given, which keeps it", () => {
    const req = editRequestFor("u-1", { github: "https://github.com/octo" })

    expect(req.linkedinUrl).toBeUndefined()
    expect(req.renkuUrl).toBeUndefined()
  })
})

describe("failForLinks", () => {
  const values = { github: "x" }

  it("passes the backend's reason through for an invalid link", () => {
    const failure = failForLinks(grpcError(Status.INVALID_ARGUMENT), values)

    expect(failure.status).toBe(400)
    expect(failure.data).toEqual({
      message: "invalid GitHub URL 'x'",
      values,
    })
  })

  it.each([
    [Status.PERMISSION_DENIED, 403],
    [Status.NOT_FOUND, 404],
  ])("maps gRPC %s to %s and keeps the typed values", (code, status) => {
    const failure = failForLinks(grpcError(code), values)

    expect(failure.status).toBe(status)
    expect(failure.data.values).toBe(values)
  })

  // Anything else is not the user's to fix, so it goes to handleError.
  it("rethrows other errors", () => {
    const unavailable = grpcError(Status.UNAVAILABLE)
    const plain = new Error("boom")

    expect(() => failForLinks(unavailable, values)).toThrow(unavailable)
    expect(() => failForLinks(plain, values)).toThrow(plain)
  })
})
