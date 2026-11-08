import { z } from "zod"

export const operationStatuses = ["idle", "invalid", "blocked", "rejected", "success"] as const

export type OperationState = {
  status: (typeof operationStatuses)[number]
  message: string | null
  at: number
}

export const initialOperationState: OperationState = { status: "idle", message: null, at: 0 }

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.email("Enter a valid email address."),
  message: z.string().trim().min(10, "Enter a message of at least 10 characters."),
  companyWebsite: z.string().trim().max(200).optional(),
})

export type ContactInput = z.infer<typeof contactSchema>

export const automationDraftSchema = z.object({
  name: z.string().trim().min(2, "Enter a name."),
  trigger: z.enum(["Manual", "Schedule", "Webhook"], { error: "Choose a trigger." }),
  description: z.string().trim().min(10, "Describe the automation in at least 10 characters."),
})

export type AutomationDraftInput = z.infer<typeof automationDraftSchema>

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address."),
  role: z.enum(["member", "editor", "admin"], { error: "Choose a role." }),
})

export type InviteInput = z.infer<typeof inviteSchema>

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter a display name."),
})

export type ProfileInput = z.infer<typeof profileSchema>

export const documentDraftSchema = z.object({
  title: z.string().trim().min(2, "Enter a title."),
  summary: z.string().trim().min(10, "Enter a summary of at least 10 characters."),
})

export type DocumentDraftInput = z.infer<typeof documentDraftSchema>

export const signupSchema = z
  .object({
    email: z.email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm the password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })

export type SignupInput = z.infer<typeof signupSchema>

export const resetSchema = z.object({
  email: z.email("Enter a valid email address."),
})

export type ResetInput = z.infer<typeof resetSchema>

export const passwordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm the password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })

export type PasswordInput = z.infer<typeof passwordSchema>
