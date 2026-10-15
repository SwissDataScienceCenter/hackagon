import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import type { EditRequest } from "$lib/server/grpc/generated/user/messages/user_svc/edit_request"
import type { ProfileLinks } from "$lib/utils/profileLinks"

/**
 * Server-only: profile links between the generated `User` and the plain
 * `ProfileLinks` a component can take, and the save action behind the Account
 * page's links form.
 *
 * Nothing here checks a link's shape. `UserService.Edit` is the authority on
 * what a GitHub, LinkedIn or Renku URL looks like, and a second copy of its
 * patterns here would be one more thing to keep in step with it.
 */

/** A user's links, `""` for each one not set. */
export function profileLinksOf(user: User | undefined): ProfileLinks {
  return {
    github: user?.githubUrl ?? "",
    linkedin: user?.linkedinUrl ?? "",
    renku: user?.renkuUrl ?? "",
  }
}

/**
 * The links a form posted, trimmed.
 *
 * A field the form did not post is `undefined`, not `""`: `""` asks the
 * backend to remove that link, and a form that simply lacks a field should not
 * remove anything.
 */
export function profileLinksFrom(form: FormData): Partial<ProfileLinks> {
  const read = (name: string) => {
    const value = form.get(name)
    return typeof value === "string" ? value.trim() : undefined
  }
  return {
    github: read("github"),
    linkedin: read("linkedin"),
    renku: read("renku"),
  }
}

/**
 * The Edit request for one user. An `undefined` link is left out, which the
 * backend reads as "keep it"; `""` removes it.
 */
export function editRequestFor(
  userId: string,
  links: Partial<ProfileLinks>,
): EditRequest {
  return {
    userId,
    githubUrl: links.github,
    linkedinUrl: links.linkedin,
    renkuUrl: links.renku,
  }
}

/**
 * The gRPC errors a save can return, as SvelteKit failures. `values` goes back
 * with each so the form keeps what was typed instead of snapping back to the
 * saved links.
 */
export function failForLinks(e: unknown, values: Partial<ProfileLinks>) {
  if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
    // The backend names the platform and quotes the link it refused.
    return fail(400, { message: e.details, values })
  }
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, {
      message: "You can only change your own profile links.",
      values,
    })
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, {
      message:
        "Your account could not be found. Sign out and back in, then try again.",
      values,
    })
  }
  throw e
}
