/**
 * Server-only: imported only by page/pages routes' `+page.server.ts` files, but
 * kept alongside `phaseForm.ts` for the same reason — the parsing logic is
 * shared between the create and edit forms via `PageForm.svelte`.
 */

/** A parsed, validated page form, in the shape the RPCs want. */
export interface PageFormValues {
  title: string
  content: string
  visible: boolean
}

export type PageFormResult =
  | { ok: true; values: PageFormValues }
  | { ok: false; message: string }

/**
 * Validate a page create/edit submission.
 *
 * Title and content limits mirror `buf.validate` on `CreateRequest`/
 * `EditRequest` (`page_svc/create_request.proto`, `edit_request.proto`) —
 * repeating them here buys a legible message instead of a raw
 * `InvalidArgument`; the RPC stays the authority.
 */
export function parsePageForm(form: FormData): PageFormResult {
  const rawTitle = form.get("title")

  const title = typeof rawTitle === "string" ? rawTitle.trim() : ""
  if (title.length < 3) {
    return { ok: false, message: "Title must be at least 3 characters" }
  }
  if (title.length > 255) {
    return { ok: false, message: "Title must be at most 255 characters" }
  }

  const rawContent = form.get("content")
  const content = typeof rawContent === "string" ? rawContent : ""
  if (content.length > 10000) {
    return { ok: false, message: "Content must be at most 10000 characters" }
  }

  // A checkbox submits nothing at all when unchecked, so presence is the
  // signal rather than its value.
  const visible = form.get("visible") !== null

  return { ok: true, values: { title, content, visible } }
}
