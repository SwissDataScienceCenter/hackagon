// A type-only import, so this module stays free of ./items' icon imports: it is
// pure string matching and nothing that calls it should have to pay for lucide.
import type { NavItem } from "./items"

/**
 * Id of the entry matching `pathname`, longest match winning so that a nested
 * route beats its parent.
 *
 * Pass every section's items in one call: computing this per-section let two
 * sections highlight simultaneously, since each only saw its own hrefs.
 */
export function activeNavId(
  pathname: string,
  items: NavItem[],
): string | undefined {
  let bestId: string | undefined
  let bestLength = -1

  for (const item of items) {
    if (!item.href) continue
    if (pathname !== item.href && !pathname.startsWith(item.href + "/"))
      continue
    if (item.href.length > bestLength) {
      bestLength = item.href.length
      bestId = item.id
    }
  }

  return bestId
}
