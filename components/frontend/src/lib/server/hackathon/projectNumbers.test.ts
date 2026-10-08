import { describe, it, expect } from "vitest"
import { numberedProjects } from "./projectNumbers"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"

describe("numberedProjects", () => {
  it("numbers the approved projects from 1, in the order given", () => {
    const projects = [
      { id: "a", status: ProjectStatus.PROJECT_STATUS_APPROVED },
      { id: "b", status: ProjectStatus.PROJECT_STATUS_PROPOSED },
      { id: "c", status: ProjectStatus.PROJECT_STATUS_APPROVED },
    ]

    expect(numberedProjects(projects).map((p) => [p.id, p.number])).toEqual([
      ["a", 1],
      ["c", 2],
    ])
  })
})
