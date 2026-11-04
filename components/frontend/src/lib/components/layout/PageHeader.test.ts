import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/svelte"
import { createRawSnippet } from "svelte"
import PageHeader from "./PageHeader.svelte"

const text = (s: string) =>
  createRawSnippet(() => ({ render: () => `<span>${s}</span>` }))

describe("PageHeader", () => {
  it("titles the page with its one h1", () => {
    render(PageHeader, { title: "Manage Tracks" })

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Manage Tracks",
    )
  })

  it("names the way back after where it leads", () => {
    render(PageHeader, {
      title: "Edit Track",
      back: { href: "/my/hackathon/1/tracks", label: "Manage Tracks" },
    })

    const link = screen.getByRole("link")
    expect(link).toHaveTextContent("← Manage Tracks")
    expect(link).toHaveAttribute("href", "/my/hackathon/1/tracks")
  })

  it("offers no way back unless given one", () => {
    render(PageHeader, { title: "Users" })

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  // The dialog is titled after the page, so every ⓘ reads the same way.
  it("puts the help button after the title, named after the page", () => {
    render(PageHeader, { title: "Users", topic: "users-list" })

    expect(
      screen.getByRole("button", { name: "About Users" }),
    ).toBeInTheDocument()
  })

  it("has no help button without a topic", () => {
    render(PageHeader, { title: "Users" })

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("renders meta and actions when given", () => {
    render(PageHeader, {
      title: "Users",
      meta: text("12 users"),
      actions: text("search"),
    })

    expect(screen.getByText("12 users")).toBeInTheDocument()
    expect(screen.getByText("search")).toBeInTheDocument()
  })
})
