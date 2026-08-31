/**
 * Which colour mode to show, and where that decision comes from.
 *
 * The rule is one line: an explicit choice outranks the system. Someone who
 * pressed the switch gets what they pressed, on every later visit; everyone else
 * gets whatever their browser says they prefer.
 *
 * It lives here rather than only inside LightSwitch because the pre-paint script
 * in `app.html` has to answer the same question before the app bundle exists,
 * and a rule stated in two places is worth stating precisely in one of them.
 * That script restates these three lines; keep the two in step.
 */
export type Mode = "light" | "dark"

/** A stored value counts only if it is actually one of the two modes. */
export function storedMode(raw: string | null | undefined): Mode | null {
  return raw === "light" || raw === "dark" ? raw : null
}

export function resolveMode(
  raw: string | null | undefined,
  prefersDark: boolean,
): Mode {
  return storedMode(raw) ?? (prefersDark ? "dark" : "light")
}
