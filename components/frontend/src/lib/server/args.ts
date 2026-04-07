import commandLineArgs from "command-line-args"

const optionDefinitions = [
  { name: "config-dir", alias: "c", type: String },
  { name: "data-dir", alias: "d", type: String },
]

// Get arguments to parse, if we run with `vite dev` we use arguments
// after `--`, otherwise normal behavior.
function getArgs(): string[] {
  const a = process.argv

  if (a[1]?.includes("vite")) {
    const index = a.indexOf("--")
    return a.slice(index + 1)
  }

  return a
}

// Parse all arguments.
export function parseArgs() {
  const args = getArgs()
  const a = commandLineArgs(optionDefinitions, { argv: args })

  // logger is not set up yet when the arguments are parsed.
  console.log({ a }, "Parsed cli arguments.")

  return a
}
