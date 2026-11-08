import { cmsItem } from "@/lib/cms/handlers"

const handlers = cmsItem("post")
export const GET = handlers.GET
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
