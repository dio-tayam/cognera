import { cmsCollection } from "@/lib/cms/handlers"

const handlers = cmsCollection("page")
export const GET = handlers.GET
export const POST = handlers.POST
