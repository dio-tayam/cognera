import "server-only"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseCredentials } from "@/lib/auth/config"

type CookieToSet = { name: string; value: string; options: CookieOptions }

function isReadOnlyCookieError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Cookies can only be modified")
}

export async function createSupabaseServerClient() {
  const credentials = supabaseCredentials()
  if (!credentials) return null

  const cookieStore = await cookies()
  return createServerClient(credentials.url, credentials.anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          }
        } catch (error) {
          if (!isReadOnlyCookieError(error)) throw error
        }
      },
    },
  })
}
