import { cmsCollection } from "@/lib/cms/handlers"

const handlers = cmsCollection("post")
export const GET = handlers.GET
export const POST = handlers.POST
