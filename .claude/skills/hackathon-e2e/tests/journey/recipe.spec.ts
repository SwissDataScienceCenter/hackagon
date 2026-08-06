import { test } from "@playwright/test"
import { loadRecipe, runAction } from "../../helpers/recipe.js"

// The full hackathon lifecycle — publication → registration → proposals →
// teams → event days → voting → post-event — as a data-driven screenplay.
// The actions live in recipe.jsonl (one JSON action per line); this file just
// executes them strictly in order. Placeholder actions (those with a "todo")
// skip while their backend RPC probes as unimplemented and start running the
// day it lands; steps depending on a skipped step cascade-skip cleanly.
//
// To extend the recipe, edit recipe.jsonl — not this file.

test.describe.configure({ mode: "serial" })

const actions = loadRecipe()

// JOURNEY_UNTIL_ACT=N plays the story only up to (and including) act N and
// leaves the stack in exactly that state — freeze the world mid-lifecycle to
// inspect it in a browser (see run.sh --until-act).
const untilAct = process.env.JOURNEY_UNTIL_ACT
  ? Number(process.env.JOURNEY_UNTIL_ACT)
  : Infinity

for (const action of actions) {
  test(`[${action.id}] ${action.title}`, async ({ browser }) => {
    test.skip(action.act > untilAct, `beyond requested act ${untilAct}`)
    await runAction(test, action, browser)
  })
}
