import "server-only"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { readSupabaseConfig } from "@/lib/auth/config"
import { createSupabaseServerClient } from "@/lib/auth/supabase"
import {
  emptyWorkspaceNotice,
  previewNotice,
  recordsFor,
  type WorkspaceRecords,
} from "@/lib/preview/fixtures"

export type AppAccess =
  | { mode: "preview"; notice: string }
  | { mode: "blocked"; notice: string }
  | { mode: "session"; email: string; notice: string }

export async function getAppAccess(): Promise<AppAccess> {
  await connection()
  const config = readSupabaseConfig()
  if (config.state === "disabled") {
    return { mode: "preview", notice: previewNotice }
  }
  if (config.state === "invalid") {
    return { mode: "blocked", notice: config.reason }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { mode: "blocked", notice: "Supabase Auth is not configured." }
  }

  const { data, error } = await supabase.auth.getUser()
  if (!data.user) {
    const missingSession =
      !error ||
      error.name === "AuthSessionMissingError" ||
      error.message.toLowerCase().includes("session")
    if (!missingSession) {
      return { mode: "blocked", notice: `Could not read the session: ${error.message}` }
    }
    redirect("/login")
  }

  return {
    mode: "session",
    email: data.user.email ?? data.user.id,
    notice: emptyWorkspaceNotice,
  }
}

export async function loadWorkspace(): Promise<{ access: AppAccess; records: WorkspaceRecords }> {
  const access = await getAppAccess()
  return { access, records: recordsFor(access.mode) }
}
