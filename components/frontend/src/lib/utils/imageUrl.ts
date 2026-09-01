// Nobody can upload a picture: `Project.image` and `Hackathon.logo` are single
// string columns, and there is no file storage behind them. So every image on
// the platform is a URL somebody typed, and the commonest thing they type is a
// *share* link — the page their cloud drive showed them after pressing Share.
//
// A share link serves HTML, not bytes. Dropped into an `<img>` it fails, and
// the only sign of it is a broken-image glyph on the page the picture was meant
// for, long after the form was submitted. These helpers move that discovery back
// into the form: `adviseImageUrl` names the mistake before the save, and
// `usableImage` keeps the failure from ever reaching a reader.

import { isHttpUrl } from "./url"

export interface ImageUrlAdvice {
  /**
   * Why this address will not load as an image, in our words — absent when
   * nothing is known to be wrong with it. Knowing nothing is not the same as
   * approval: only the preview can actually tell whether a URL serves an image.
   */
  problem?: string
  /**
   * The same picture as bytes, when it can be derived from what was typed.
   * Offered as a one-press correction, never applied silently — the address in
   * the field should stay the one the person put there until they say so.
   */
  direct?: string
}

/** Whether `host` is `domain` itself or a subdomain of it. */
function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * What is wrong with `value` as an image address, as far as can be told without
 * fetching it.
 *
 * Only reports what is *certain*: every case below is a URL whose server is
 * known to answer with a web page. A URL that passes still has to prove itself
 * by loading — see `ImageUrlField`, where this advice explains a failure the
 * preview has already demonstrated.
 */
export function adviseImageUrl(value: string): ImageUrlAdvice {
  const trimmed = value.trim()
  if (trimmed === "") return {}

  if (!isHttpUrl(trimmed)) {
    return {
      problem: "This is not a web address — it has to start with https://",
    }
  }

  const url = new URL(trimmed)
  const host = url.hostname.toLowerCase()
  const path = url.pathname

  // GitHub's `blob` URL is the file *viewer*. The same path under
  // raw.githubusercontent.com is the file, which is a documented, stable
  // rewrite — hence the only two corrections offered here are this and Dropbox.
  if (isHost(host, "github.com")) {
    const blob = path.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/)
    if (blob) {
      return {
        problem:
          "A GitHub file page shows the picture inside GitHub's own page.",
        direct: `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`,
      }
    }
  }

  if (isHost(host, "dropbox.com")) {
    // `?dl=0` is the preview page and `?dl=1` forces a download; `raw=1` is the
    // file served inline, which is the one an `<img>` can use.
    if (url.searchParams.get("raw") !== "1") {
      const direct = new URL(trimmed)
      direct.searchParams.delete("dl")
      direct.searchParams.set("raw", "1")
      return {
        problem: "A Dropbox share link opens Dropbox's preview page.",
        direct: direct.toString(),
      }
    }
    return {}
  }

  // No correction for the rest. Google Drive's old `uc?export=view` trick is
  // rate-limited and increasingly refused, and the others have no documented
  // direct form at all — offering a rewrite that works today and breaks next
  // month is worse than saying plainly that this kind of link cannot be used.
  if (isHost(host, "drive.google.com") || isHost(host, "docs.google.com")) {
    return {
      problem:
        "A Google Drive share link opens Drive, and Drive will not serve the " +
        "file to another site. Put the picture somewhere it is published on its own.",
    }
  }
  if (isHost(host, "photos.google.com") || isHost(host, "photos.app.goo.gl")) {
    return {
      problem:
        "A Google Photos link opens the Photos viewer, not the picture itself.",
    }
  }
  if (
    isHost(host, "onedrive.live.com") ||
    isHost(host, "1drv.ms") ||
    isHost(host, "sharepoint.com")
  ) {
    return {
      problem: "A OneDrive or SharePoint share link opens their viewer page.",
    }
  }
  // i.imgur.com is the image host; imgur.com itself serves album and gallery
  // pages, and a bare post page too.
  if (isHost(host, "imgur.com") && host !== "i.imgur.com") {
    return {
      problem:
        "This is an Imgur page rather than the image file on i.imgur.com.",
    }
  }
  if (isHost(host, "flickr.com") && path.startsWith("/photos/")) {
    return { problem: "A Flickr photo page is a web page, not the image file." }
  }
  if (isHost(host, "unsplash.com") && path.startsWith("/photos/")) {
    return {
      problem:
        "An Unsplash photo page is a web page — the Download button gives the image address.",
    }
  }

  return {}
}

/**
 * Whether `src` should be put in front of a reader.
 *
 * `failedSrc` is the address whose `<img>` last raised `error`, recorded by the
 * component drawing it. Comparing against it — rather than keeping a boolean —
 * is what lets a corrected address be tried afresh: a component reused down a
 * list of rows, or re-rendered after an edit, must not stay failed because some
 * earlier URL was.
 *
 * Every surface showing a stored image address goes through this, because the
 * alternative is the browser's broken-image glyph, which reads as a bug in the
 * app rather than as a bad link somebody typed.
 */
export function usableImage(src?: string, failedSrc?: string): boolean {
  return src !== undefined && src !== "" && failedSrc !== src
}
