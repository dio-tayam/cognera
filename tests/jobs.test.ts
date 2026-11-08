import { afterEach, describe, expect, test } from "vitest"
import { claimJob, completeJob, countJobs, enqueueJob, failJob } from "@/lib/db/jobs"
import { withTenant } from "@/lib/db/tenant"
import { createMigratedDatabase, seedTenant } from "./helpers/database"

const clients: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe("job queue", () => {
  test("claims, completes, retries, and isolates tenants", async () => {
    const client = await createMigratedDatabase()
    clients.push(client)
    const alpha = await seedTenant(client, "Alpha", "user-alpha")
    const beta = await seedTenant(client, "Beta", "user-beta")

    const first = await withTenant(client, alpha, (tx) =>
      enqueueJob(tx, { type: "inbox.sync", payload: { source: "alpha" }, maxAttempts: 2 }),
    )
    await withTenant(client, alpha, (tx) =>
      enqueueJob(tx, { type: "inbox.sync", payload: { source: "later" } }),
    )
    await withTenant(client, beta, (tx) =>
      enqueueJob(tx, { type: "inbox.sync", payload: { source: "beta" } }),
    )

    const claimed = await withTenant(client, alpha, (tx) => claimJob(tx, "worker-a"))
    expect(claimed?.id).toBe(first.id)
    expect(claimed?.status).toBe("running")
    expect(claimed?.attempts).toBe(1)

    const hidden = await withTenant(client, beta, async (tx) => {
      const result = await tx.query("select id from jobs where id = $1::uuid", [first.id])
      return result.rows
    })
    expect(hidden).toHaveLength(0)

    const retry = await withTenant(client, alpha, (tx) =>
      failJob(tx, first.id, "upstream timed out", 60),
    )
    expect(retry.status).toBe("failed")
    expect(new Date(retry.runAfter).getTime()).toBeGreaterThan(Date.now())

    const next = await withTenant(client, alpha, (tx) => claimJob(tx, "worker-a"))
    expect(next?.id).not.toBe(first.id)
    const done = await withTenant(client, alpha, (tx) => completeJob(tx, next!.id))
    expect(done.status).toBe("succeeded")

    await withTenant(client, alpha, async (tx) => {
      await tx.query("update jobs set run_after = now() where id = $1::uuid", [first.id])
    })
    const again = await withTenant(client, alpha, (tx) => claimJob(tx, "worker-a"))
    expect(again?.id).toBe(first.id)
    const dead = await withTenant(client, alpha, (tx) => failJob(tx, first.id, "still failing", 0))
    expect(dead.status).toBe("dead")

    const counts = await withTenant(client, alpha, (tx) => countJobs(tx))
    expect(counts.succeeded).toBe(1)
    expect(counts.dead).toBe(1)
    expect(counts.pending).toBe(0)

    await expect(
      withTenant(client, { tenantId: alpha.tenantId, userId: "intruder" }, (tx) => countJobs(tx)),
    ).rejects.toThrow(/do not belong/)
  })
})
