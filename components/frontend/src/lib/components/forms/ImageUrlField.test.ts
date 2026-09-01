import { fireEvent, render, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ImageUrlField from "./ImageUrlField.svelte"

/*
 * The advice itself is covered in utils/imageUrl.test.ts. What is left to prove
 * here is the part that cannot be a pure function: that the preview is what
 * decides, that its verdict follows the field rather than sticking to the first
 * address typed, and that the field warns without ever blocking the submit.
 *
 * jsdom loads nothing, so neither `load` nor `error` ever fires on its own. The
 * events are dispatched by hand, which is what a real browser does a moment
 * later; the component cannot tell the difference.
 */

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Renders, types `value`, and lets the debounce elapse. */
async function typing(value: string, initial = "") {
  const { container } = render(ImageUrlField, {
    props: { name: "logo", label: "Logo URL (optional)", value: initial },
  })
  const input = container.querySelector("input")!

  if (value !== initial) await fireEvent.input(input, { target: { value } })
  await vi.advanceTimersByTimeAsync(600)
  await tick()

  return { input, container }
}

const preview = (container: HTMLElement) =>
  container.querySelector<HTMLImageElement>("img")

describe("ImageUrlField", () => {
  it("posts the typed address under the given name", async () => {
    const { input } = await typing("https://example.org/logo.png")

    expect(input.name).toBe("logo")
    expect(input.value).toBe("https://example.org/logo.png")
  })

  it("says nothing at all while the field is empty", async () => {
    const { container } = await typing("")

    expect(preview(container)).toBeNull()
    expect(screen.queryByText(/does not load/)).toBeNull()
  })

  it("tries to load what was typed", async () => {
    const { container } = await typing("https://example.org/logo.png")

    expect(preview(container)?.src).toBe("https://example.org/logo.png")
    expect(screen.getByText(/Checking the link/)).toBeTruthy()
  })

  it("waits for typing to stop before requesting anything", async () => {
    const { container } = render(ImageUrlField, {
      props: { name: "logo", label: "Logo URL" },
    })
    const input = container.querySelector("input")!

    await fireEvent.input(input, { target: { value: "https://exa" } })
    await vi.advanceTimersByTimeAsync(200)
    await tick()

    expect(preview(container)).toBeNull()
  })

  it("shows the picture once it loads", async () => {
    const { container } = await typing("https://example.org/logo.png")

    await fireEvent.load(preview(container)!)
    await tick()

    expect(screen.getByText(/what will be shown/)).toBeTruthy()
    expect(preview(container)).not.toBeNull()
  })

  it("reports an address that will not load, and drops the preview", async () => {
    const { container } = await typing("https://example.org/not-an-image")

    await fireEvent.error(preview(container)!)
    await tick()

    expect(screen.getByText(/does not load as an image/)).toBeTruthy()
    expect(preview(container)).toBeNull()
  })

  it("explains a share link once the preview has failed", async () => {
    const { container } = await typing(
      "https://drive.google.com/file/d/1AbC/view",
    )

    await fireEvent.error(preview(container)!)
    await tick()

    expect(screen.getByText(/Google Drive share link/)).toBeTruthy()
  })

  it("tries again when the address is corrected", async () => {
    const { input, container } = await typing("https://example.org/bad.png")

    await fireEvent.error(preview(container)!)
    await tick()
    expect(preview(container)).toBeNull()

    await fireEvent.input(input, {
      target: { value: "https://example.org/good.png" },
    })
    await vi.advanceTimersByTimeAsync(600)
    await tick()

    expect(preview(container)?.src).toBe("https://example.org/good.png")
  })

  it("swaps in the direct link when offered one, and only when pressed", async () => {
    const { input } = await typing(
      "https://github.com/acme/site/blob/main/logo.png",
    )

    expect(input.value).toBe("https://github.com/acme/site/blob/main/logo.png")

    await fireEvent.click(screen.getByText(/Use the direct link/))
    await tick()

    expect(input.value).toBe(
      "https://raw.githubusercontent.com/acme/site/main/logo.png",
    )
  })

  it("refuses to preview something that is not a web address", async () => {
    const { container } = await typing("logo.png")

    expect(preview(container)).toBeNull()
    expect(screen.getByText(/not a link a browser can open/)).toBeTruthy()
  })

  it("previews an address it was given, without waiting to be typed into", async () => {
    const { container } = await typing(
      "https://example.org/saved.png",
      "https://example.org/saved.png",
    )

    expect(preview(container)?.src).toBe("https://example.org/saved.png")
  })
})
