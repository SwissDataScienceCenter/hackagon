import { isHttpsUrl } from "$lib/utils/url"
import type { SubmissionEntry } from "./submissions"

/**
 * Server-only: imported only by the submissions route's `+page.server.ts`, but
 * kept alongside `pageForm.ts` so the parsing can be tested without a request.
 */

/**
 * A parsed, validated submission form, in the shape `CreateSubmission` wants.
 * A field left blank is undefined rather than `""`, so it is not sent at all.
 */
export interface SubmissionFormValues {
  repositoryUrl: string | undefined
  attachmentFolderUrl: string | undefined
  description: string | undefined
}

export type SubmissionFormResult =
  { ok: true; values: SubmissionFormValues } | { ok: false; message: string }

/** Both links share the limit on `CreateSubmissionRequest`. */
const URL_MAX = 2048
const DESCRIPTION_MAX = 10000

/**
 * Validate a new submission version.
 *
 * The https rule and the limits mirror `CreateSubmission`
 * (`requireHTTPSURL` and the `buf.validate` rules on
 * `team_svc/create_submission_request.proto`). Repeating them here buys a
 * message that names the field the person typed into — the backend's names
 * `result` — while the RPC stays the authority.
 *
 * Every field is optional on the backend, but a version with none of them is
 * refused here: version numbers are permanent and monotonic, so an empty one
 * burns a number for nothing.
 */
export function parseSubmissionForm(form: FormData): SubmissionFormResult {
  const repositoryUrl = text(form, "repositoryUrl")
  const attachmentFolderUrl = text(form, "attachmentFolderUrl")
  const description = text(form, "description")

  if (!repositoryUrl && !attachmentFolderUrl && !description) {
    return {
      ok: false,
      message: "Add a repository link, an attachments link or a description",
    }
  }

  const links = [
    [repositoryUrl, "The repository link"],
    [attachmentFolderUrl, "The attachments link"],
  ] as const
  for (const [value, label] of links) {
    if (value === undefined) continue
    if (value.length > URL_MAX) {
      return {
        ok: false,
        message: `${label} must be at most ${URL_MAX} characters`,
      }
    }
    if (!isHttpsUrl(value)) {
      return { ok: false, message: `${label} must start with https://` }
    }
  }

  if (description !== undefined && description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      message: `The description must be at most ${DESCRIPTION_MAX} characters`,
    }
  }

  return {
    ok: true,
    values: { repositoryUrl, attachmentFolderUrl, description },
  }
}

/**
 * Whether saving these values would change nothing about the team's entry.
 *
 * A save that changes nothing is skipped rather than sent: it would add a
 * version identical to the last. Blank and absent count as the same, and the
 * entry's side is trimmed like the form's, so older content saved with stray
 * whitespace does not read as a change.
 */
export function sameSubmission(
  entry: Pick<
    SubmissionEntry,
    "repositoryUrl" | "attachmentFolderUrl" | "description"
  > | null,
  values: SubmissionFormValues,
): boolean {
  if (!entry) return false

  return (
    ["repositoryUrl", "attachmentFolderUrl", "description"] as const
  ).every((k) => (entry[k] ?? "").trim() === (values[k] ?? ""))
}

/** A field's trimmed value, or undefined when it is missing or blank. */
function text(form: FormData, name: string): string | undefined {
  const raw = form.get(name)
  const value = typeof raw === "string" ? raw.trim() : ""

  return value === "" ? undefined : value
}
