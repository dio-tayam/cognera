import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { requireCrmContext, requireMutation } from "@/lib/crm/context"
import { createCategory, listCategories } from "@/lib/cms/taxonomy"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

const writeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export async function GET() {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const categories = await listCategories(access.context.database, access.context)
    return jsonOk({ categories })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "cms.categories_failed")
    return jsonFromError(error)
  }
}

export async function POST(request: Request) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("lead_write", access.context.userId)
    if (blocked) return blocked
    const parsed = writeSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return jsonError(400, "invalid_content", "Check the category name and slug.")
    const category = await createCategory(access.context.database, access.context, parsed.data)
    return jsonOk({ category }, 201)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "cms.category_create_failed")
    return jsonFromError(error)
  }
}
