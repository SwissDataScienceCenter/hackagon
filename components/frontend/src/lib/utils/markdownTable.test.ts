/**
 * The paste-a-table converter, as a pure function.
 *
 * The last block is the one that matters most: it renders the generated
 * markdown through the app's real pipeline and counts rows and columns in the
 * resulting DOM. "The markdown contains pipes" and "it renders as a table" are
 * different claims, and only the second one is what the button promises.
 */

import { describe, expect, it } from "vitest"
import { renderMarkdown } from "./markdown"
import {
  escapeCell,
  parseDelimited,
  sniffDelimiter,
  tableFromPaste,
  toMarkdownTable,
} from "./markdownTable"

const TSV = "Name\tRole\nAlice\tOrganizer\nBob\tParticipant"

describe("parseDelimited", () => {
  it("splits tab-separated text as a spreadsheet paste arrives", () => {
    expect(parseDelimited(TSV, "\t")).toEqual([
      ["Name", "Role"],
      ["Alice", "Organizer"],
      ["Bob", "Participant"],
    ])
  })

  it("splits comma-separated text", () => {
    expect(parseDelimited("a,b\nc,d", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("keeps a quoted delimiter inside its field", () => {
    expect(parseDelimited('"Lausanne, VD",CH\nGeneva,CH', ",")).toEqual([
      ["Lausanne, VD", "CH"],
      ["Geneva", "CH"],
    ])
  })

  it("reads a doubled quote inside a quoted field as one quote", () => {
    expect(parseDelimited('"She said ""hi""",ok', ",")).toEqual([
      ['She said "hi"', "ok"],
    ])
  })

  it("keeps a quote in the middle of an unquoted field as data", () => {
    // Spreadsheets treat a quote as special only at the start of a field, so
    // `5" pipe` is a measurement, not a parse error.
    expect(parseDelimited('5" pipe,steel', ",")).toEqual([['5" pipe', "steel"]])
  })

  it("keeps a newline inside a quoted field", () => {
    expect(parseDelimited('"line one\nline two",b', ",")).toEqual([
      ["line one\nline two", "b"],
    ])
  })

  it("ends rows on CRLF and on a lone CR", () => {
    expect(parseDelimited("a,b\r\nc,d", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
    expect(parseDelimited("a,b\rc,d", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("drops a trailing newline and blank lines rather than inventing rows", () => {
    expect(parseDelimited("a,b\n\nc,d\n", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("returns ragged rows as they came, without padding", () => {
    expect(parseDelimited("a,b,c\nd,e", ",")).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ])
  })
})

describe("sniffDelimiter", () => {
  it("picks tab for a spreadsheet paste", () => {
    const got = sniffDelimiter(TSV)
    expect(got.delimiter).toBe("\t")
    expect(got.ambiguous).toBe(false)
  })

  it("picks comma for CSV", () => {
    expect(sniffDelimiter("a,b\nc,d").delimiter).toBe(",")
  })

  it("picks semicolon when that is what separates the fields", () => {
    expect(sniffDelimiter("a;b\nc;d").delimiter).toBe(";")
  })

  it("prefers tab over a comma that only appears inside cells", () => {
    // Splitting on the comma also produces a consistent 2-column grid
    // ("Lausanne" + " VD\tCH"), so the tie has to be broken towards tab or
    // every ordinary spreadsheet paste containing prose is called ambiguous.
    const got = sniffDelimiter("Lausanne, VD\tCH\nGeneva, GE\tCH")
    expect(got.delimiter).toBe("\t")
    expect(got.ambiguous).toBe(false)
  })

  it("still finds the delimiter when one row is short", () => {
    // Ragged input is normal; requiring every row to agree would make this
    // fall through to the "nothing splits it" default and produce one column.
    const got = sniffDelimiter("a,b,c\nd,e")
    expect(got.delimiter).toBe(",")
    expect(got.ambiguous).toBe(false)
  })

  it("reports ambiguity when two delimiters both explain the data", () => {
    // European CSV: `;` between fields, `,` as the decimal mark. Splitting on
    // either yields a consistent grid, so this genuinely needs a human.
    const got = sniffDelimiter("1,5;2,5\n3,5;4,5")
    expect(got.ambiguous).toBe(true)
    expect(got.candidates).toEqual(expect.arrayContaining([";", ","]))
    // Fewest columns wins the tie, which happens to be the right answer here.
    expect(got.delimiter).toBe(";")
  })

  it("reports no candidates for text nothing splits", () => {
    const got = sniffDelimiter("just a sentence\nand another one")
    expect(got.candidates).toEqual([])
    expect(got.ambiguous).toBe(false)
  })
})

describe("escapeCell", () => {
  it("escapes a pipe so it cannot end the cell", () => {
    expect(escapeCell("a|b")).toBe("a\\|b")
  })

  it("escapes the backslash before the pipe", () => {
    // Without escaping the backslash first this becomes `a\\|b`, which GFM
    // reads as an escaped backslash followed by a LIVE pipe — the cell splits.
    expect(escapeCell("a\\|b")).toBe("a\\\\\\|b")
  })

  it("turns an embedded newline into a line break", () => {
    expect(escapeCell("one\ntwo")).toBe("one<br>two")
    expect(escapeCell("one\r\ntwo")).toBe("one<br>two")
  })

  it("trims surrounding whitespace", () => {
    expect(escapeCell("  padded  ")).toBe("padded")
  })
})

describe("toMarkdownTable", () => {
  it("emits a header, an alignment separator and one line per row", () => {
    expect(
      toMarkdownTable([
        ["Name", "Role"],
        ["Alice", "Organizer"],
      ]),
    ).toBe(
      [
        "| Name  | Role      |",
        "| ----- | --------- |",
        "| Alice | Organizer |",
      ].join("\n"),
    )
  })

  it("pads short rows instead of dropping the wide row's extra column", () => {
    const md = toMarkdownTable([
      ["a", "b", "c"],
      ["d", "e"],
    ])
    expect(md.split("\n")).toHaveLength(3)
    expect(md).toContain("| d   | e   |     |")
  })

  it("widens the header when a LATER row is the wide one", () => {
    // The column count is the widest row, not the first one. Taking it from
    // row 0 truncates every row after it — and a mutation test caught that
    // nothing here noticed, because every ragged case above happened to have
    // its widest row first.
    const md = toMarkdownTable([
      ["a", "b"],
      ["c", "d", "e"],
    ])
    expect(md.split("\n")).toEqual([
      "| a   | b   |     |",
      "| --- | --- | --- |",
      "| c   | d   | e   |",
    ])
  })

  it("handles a single column", () => {
    expect(toMarkdownTable([["Name"], ["Alice"]])).toBe(
      ["| Name  |", "| ----- |", "| Alice |"].join("\n"),
    )
  })

  it("handles a header-only table", () => {
    expect(toMarkdownTable([["a", "b"]])).toBe(
      ["| a   | b   |", "| --- | --- |"].join("\n"),
    )
  })

  it("emits an empty header row when the first row is data", () => {
    const md = toMarkdownTable(
      [
        ["a", "b"],
        ["c", "d"],
      ],
      { firstRowIsHeader: false },
    )
    expect(md.split("\n")).toHaveLength(4)
    expect(md.split("\n")[0]).toBe("|     |     |")
    expect(md).toContain("| a   | b   |")
  })

  it("returns an empty string for no rows", () => {
    expect(toMarkdownTable([])).toBe("")
  })
})

describe("tableFromPaste", () => {
  it("converts a spreadsheet paste and reports its shape", () => {
    const got = tableFromPaste(TSV)
    expect(got).not.toBeNull()
    expect(got!.delimiter).toBe("\t")
    expect(got!.columns).toBe(2)
    expect(got!.rows).toBe(2)
    expect(got!.markdown.split("\n")).toEqual([
      "| Name  | Role        |",
      "| ----- | ----------- |",
      "| Alice | Organizer   |",
      "| Bob   | Participant |",
    ])
  })

  it("honours an explicit delimiter and stops calling it ambiguous", () => {
    const got = tableFromPaste("1,5;2,5\n3,5;4,5", { delimiter: "," })
    expect(got!.columns).toBe(3)
    expect(got!.ambiguous).toBe(false)
  })

  it("counts every row as a body row when there is no header", () => {
    const got = tableFromPaste("a,b\nc,d", { firstRowIsHeader: false })
    expect(got!.rows).toBe(2)
  })

  it("returns null for empty or blank input", () => {
    expect(tableFromPaste("")).toBeNull()
    expect(tableFromPaste("   \n  ")).toBeNull()
  })
})

/**
 * The end of the chain: what the preview pane actually shows.
 *
 * `renderMarkdown` is the same function `MarkdownContent.svelte` calls, so a
 * table that renders here renders in the editor's Preview tab.
 */
describe("the generated markdown renders as a real table", () => {
  /** Render a paste through the real pipeline and read the table back. */
  const render = (input: string, options?: Parameters<typeof tableFromPaste>[1]) => {
    const converted = tableFromPaste(input, options)
    if (!converted) throw new Error("nothing was converted")

    const host = document.createElement("div")
    host.innerHTML = renderMarkdown(converted.markdown)

    const rows = Array.from(host.querySelectorAll("tbody tr"))
    return {
      host,
      table: host.querySelector("table"),
      headers: Array.from(host.querySelectorAll("thead th")),
      rows,
      /** Cells of body row `n`. */
      cells: (n: number) => Array.from(rows[n]?.querySelectorAll("td") ?? []),
    }
  }

  it("becomes a <table> with the right number of rows and columns", () => {
    const got = render(TSV)

    expect(got.table).not.toBeNull()
    expect(got.headers).toHaveLength(2)
    expect(got.rows).toHaveLength(2)
    expect(got.cells(0)).toHaveLength(2)
    expect(got.headers[0]?.textContent).toBe("Name")
    expect(got.cells(1)[1]?.textContent).toBe("Participant")
  })

  it("keeps a literal pipe inside a cell instead of splitting the row", () => {
    const got = render("h1\th2\na|b\tc")

    expect(got.cells(0)).toHaveLength(2)
    expect(got.cells(0)[0]?.textContent).toBe("a|b")
    expect(got.cells(0)[1]?.textContent).toBe("c")
  })

  it("keeps a literal backslash-pipe inside a cell", () => {
    const got = render("h1\th2\na\\|b\tc")

    expect(got.cells(0)).toHaveLength(2)
    expect(got.cells(0)[0]?.textContent).toBe("a\\|b")
  })

  it("renders a multi-line cell as one cell with a line break", () => {
    const got = render('h1,h2\n"one\ntwo",c')

    expect(got.cells(0)).toHaveLength(2)
    expect(got.cells(0)[0]?.querySelector("br")).not.toBeNull()
    expect(got.cells(0)[0]?.textContent).toBe("onetwo")
  })

  it("renders a ragged row as a full-width row with an empty cell", () => {
    const got = render("a,b,c\nd,e")

    expect(got.headers).toHaveLength(3)
    expect(got.cells(0)).toHaveLength(3)
    expect(got.cells(0)[2]?.textContent).toBe("")
  })

  it("keeps a stray extra field, widening the header to hold it", () => {
    // The other direction: the wide row comes SECOND. GFM would drop a cell
    // the header has no column for, so the header has to grow — which is why
    // the column count is the widest row rather than the first.
    const got = render("a,b\nc,d,e")

    expect(got.headers).toHaveLength(3)
    expect(got.headers[2]?.textContent).toBe("")
    expect(got.cells(0)).toHaveLength(3)
    expect(got.cells(0)[2]?.textContent).toBe("e")
  })

  it("renders a single-column table", () => {
    const got = render("Name\nAlice\nBob")

    expect(got.table).not.toBeNull()
    expect(got.headers).toHaveLength(1)
    expect(got.rows).toHaveLength(2)
  })

  it("renders a header-only table with no body rows", () => {
    const got = render("a,b")

    expect(got.table).not.toBeNull()
    expect(got.headers).toHaveLength(2)
    expect(got.rows).toHaveLength(0)
  })

  it("renders every data row when the first row is not a header", () => {
    const got = render("a,b\nc,d", { firstRowIsHeader: false })

    expect(got.rows).toHaveLength(2)
    expect(got.headers).toHaveLength(2)
    expect(got.headers[0]?.textContent).toBe("")
  })

  it("does not let a cell smuggle HTML through the escape", () => {
    // `<br>` is deliberately produced by escapeCell, so the sanitizer is the
    // only thing standing between a pasted cell and script execution.
    const got = render('h1,h2\n"<img src=x onerror=alert(1)>",c')

    expect(got.host.innerHTML).not.toContain("onerror")
    expect(got.host.innerHTML).not.toContain("alert")
  })
})
