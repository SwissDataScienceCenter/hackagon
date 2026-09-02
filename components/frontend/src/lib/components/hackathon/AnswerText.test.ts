import { render, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"

import AnswerText from "./AnswerText.svelte"

/*
 * The splitting is covered in utils/linkify.test.ts. What is left to prove here
 * is what only rendering can show: that a link opens away from the app without
 * handing the opener over, and that packing the markup tight really does leave
 * the sentence intact — a stray newline between the tags would put a space in
 * the middle of somebody's answer, and no unit test of the splitter would see
 * it.
 */

describe("AnswerText", () => {
  it("says a tick-box answer in words", () => {
    const { container } = render(AnswerText, { props: { value: true } })
    expect(container.textContent).toBe("Yes")
  })

  it("says the other tick-box answer in words", () => {
    const { container } = render(AnswerText, { props: { value: false } })
    expect(container.textContent).toBe("No")
  })

  it("prints an answer with no address as it was written", () => {
    const answer = "I have been to three of these."
    const { container } = render(AnswerText, { props: { value: answer } })
    expect(container.textContent).toBe(answer)
    expect(container.querySelector("a")).toBeNull()
  })

  it("links an address and leaves the sentence around it unchanged", () => {
    const answer = "mine is https://example.dev/me, come and look."
    const { container } = render(AnswerText, { props: { value: answer } })

    expect(container.textContent).toBe(answer)

    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "https://example.dev/me")
    expect(link).toHaveTextContent("https://example.dev/me")
  })

  it("opens a link away from the app without handing over the opener", () => {
    render(AnswerText, { props: { value: "https://example.dev" } })

    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("puts markup in an answer on the page as text", () => {
    const answer = "<b>bold</b> and https://example.dev"
    const { container } = render(AnswerText, { props: { value: answer } })

    expect(container.textContent).toBe(answer)
    expect(container.querySelector("b")).toBeNull()
  })
})
