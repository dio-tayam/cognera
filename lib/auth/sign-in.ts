import { z } from "zod"

export const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
})

export type SignInInput = z.infer<typeof signInSchema>

export type SignInState = {
  status: "idle" | "blocked" | "invalid" | "rejected"
  message: string | null
}

export const initialSignInState: SignInState = { status: "idle", message: null }
