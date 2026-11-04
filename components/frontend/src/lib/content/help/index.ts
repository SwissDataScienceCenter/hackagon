// The texts behind the ⓘ buttons, one Markdown file per box in this folder,
// named by topic: `users-list.md` is `<InfoToggle topic="users-list">`.
//
// Kept out of the components so wording can be changed without touching
// markup, and read in one place. Only fixed text belongs here — anything that
// names a user or depends on state is assembled in code.
//
// Bundled at build time, so a page never waits on a request for its help.
// help.test.ts fails on a topic with no file, or a file no page uses.

const FILES = import.meta.glob<string>("./*.md", {
  query: "?raw",
  import: "default",
  eager: true,
})

/** Every help text, by topic: the file name without `./` and `.md`. */
export const HELP: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, text]) => [
    path.replace(/^\.\//, "").replace(/\.md$/, ""),
    text,
  ]),
)
