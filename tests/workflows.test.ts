import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { clearWorkflows, registerWorkflow } from "@/lib/workflows/registry"
import { resumeWorkflow, startWorkflow } from "@/lib/workflows/engine"
import { createMigratedDatabase, seedTenant } from "./helpers/database"

const clients: Array<{ close: () => Promise<void> }> = []

beforeEach(() => {
  clearWorkflows()
})

afterEach(async () => {
  clearWorkflows()
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe("workflow engine", () => {
  test("persists successful steps and resumes after a failure", async () => {
    const calls: string[] = []
    let failSecond = true
    registerWorkflow({
      id: "test.sequence",
      steps: [
        {
          id: "first",
          run: async () => {
            calls.push("first")
            return { state: { first: true } }
          },
        },
        {
          id: "second",
          run: async () => {
            calls.push("second")
            if (failSecond) throw new Error("boom")
            return { state: { second: true }, output: { done: true } }
          },
        },
      ],
    })

    const client = await createMigratedDatabase()
    clients.push(client)
    const scope = await seedTenant(client, "Alpha", "user-alpha")
    const failed = await startWorkflow(client, scope, "test.sequence", { hello: "cognera" })
    expect(failed.status).toBe("failed")
    expect(failed.error).toContain("boom")
    expect(failed.state).toEqual({ first: true })
    expect(calls).toEqual(["first", "second"])

    failSecond = false
    const resumed = await resumeWorkflow(client, scope, failed.id)
    expect(resumed.status).toBe("succeeded")
    expect(resumed.state).toEqual({ first: true, second: true })
    expect(resumed.output).toEqual({ done: true })
    expect(calls).toEqual(["first", "second", "second"])

    const again = await resumeWorkflow(client, scope, failed.id)
    expect(again.status).toBe("succeeded")
    expect(calls).toEqual(["first", "second", "second"])
  })
})
