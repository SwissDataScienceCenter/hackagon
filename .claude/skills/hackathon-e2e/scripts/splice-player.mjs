#!/usr/bin/env node
// Re-splice recipe.jsonl into recipe-player.html between the
// <script id="recipe-data"> markers. Required after ANY recipe edit — the
// player shows what is embedded, not the file on disk.
//
// The escape is part of the splice, not cosmetics: an inline <script> block
// ends at the FIRST literal close tag, even inside a JSON string — and
// act0.about.xss pastes a script tag on purpose, which once truncated the
// embedded data to 10 of 274 actions. `</` becomes `<\/`, which JSON parses
// back to the identical characters.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const skillDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const playerPath = path.join(skillDir, "recipe-player.html")
const recipePath = path.join(skillDir, "recipe.jsonl")

const html = fs.readFileSync(playerPath, "utf8")
const open = '<script id="recipe-data" type="application/jsonl">'
const start = html.indexOf(open)
if (start < 0) throw new Error("open marker not found in recipe-player.html")
const bodyStart = start + open.length
const close = "</" + "script>"
const end = html.indexOf(close, bodyStart)
if (end < 0) throw new Error("close marker not found in recipe-player.html")

const recipe = fs
  .readFileSync(recipePath, "utf8")
  .trimEnd()
  .split("</")
  .join("<\\/")

fs.writeFileSync(
  playerPath,
  html.slice(0, bodyStart) + "\n" + recipe + "\n" + html.slice(end),
)

// Read back and count — a splice nobody verified is how the player once
// showed 10 actions of 274 while every suite stayed green.
const back = fs.readFileSync(playerPath, "utf8")
const s2 = back.indexOf(open) + open.length
const e2 = back.indexOf(close, s2)
const lines = back
  .slice(s2, e2)
  .trim()
  .split("\n")
  .filter(Boolean)
let actions = 0
for (const l of lines) {
  const o = JSON.parse(l) // throws on a truncated or mangled line
  if (o.id) actions++
}
const sourceActions = fs
  .readFileSync(recipePath, "utf8")
  .split("\n")
  .filter((l) => /"id"\s*:/.test(l)).length
if (actions !== sourceActions) {
  throw new Error(
    `player embeds ${actions} actions but recipe.jsonl has ${sourceActions}`,
  )
}
console.log(`player embeds ${lines.length} lines, ${actions} actions — matches recipe.jsonl`)
