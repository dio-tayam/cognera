"use client"

import { useActionState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, describedBy } from "@/components/forms/field"
import { useOperationToast } from "@/components/forms/use-operation-toast"
import { useUnsavedChanges } from "@/components/forms/use-unsaved-changes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { changePasswordAction } from "@/lib/auth/actions"
import { inviteTeammate, saveProfile } from "@/lib/forms/actions"
import {
  acceptInvitationAction,
  createOrganizationAction,
  deleteAccountAction,
} from "@/lib/org/actions"
import {
  initialOperationState,
  inviteSchema,
  passwordSchema,
  profileSchema,
  type InviteInput,
  type PasswordInput,
  type ProfileInput,
} from "@/lib/forms/schemas"

const roles = [
  { value: "member", label: "Member" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
] as const

export function ProfileForm() {
  const [state, submit, pending] = useActionState(saveProfile, initialOperationState)
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: "" },
  })
  useOperationToast(state)
  useUnsavedChanges(form.formState.isDirty)

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        submit(values)
      })}
    >
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>{state.status === "success" ? "Profile saved" : "Not saved"}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field
        label="Display name"
        htmlFor="display-name"
        error={form.formState.errors.displayName?.message}
      >
        <Input
          id="display-name"
          aria-invalid={form.formState.errors.displayName ? true : undefined}
          aria-describedby={describedBy("display-name", form.formState.errors.displayName?.message)}
          {...form.register("displayName")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking profile" : "Save profile"}
      </Button>
    </form>
  )
}

export function InviteForm() {
  const [state, submit, pending] = useActionState(inviteTeammate, initialOperationState)
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
  })
  useOperationToast(state)
  useUnsavedChanges(form.formState.isDirty)

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        submit(values)
      })}
    >
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Invitation saved" : "Invitation not sent"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field label="Email" htmlFor="invite-email" error={form.formState.errors.email?.message}>
        <Input
          id="invite-email"
          type="email"
          aria-invalid={form.formState.errors.email ? true : undefined}
          aria-describedby={describedBy("invite-email", form.formState.errors.email?.message)}
          {...form.register("email")}
        />
      </Field>
      <Field label="Role" htmlFor="invite-role" error={form.formState.errors.role?.message}>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select
              items={roles}
              value={field.value}
              onValueChange={(value) => {
                if (value) field.onChange(value)
              }}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking invitation" : "Send invitation"}
      </Button>
    </form>
  )
}

export function PasswordForm({
  mode,
  reason,
}: {
  mode: "ready" | "unavailable"
  reason: string | null
}) {
  const [state, submit, pending] = useActionState(changePasswordAction, initialOperationState)
  const form = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })
  const unavailable = mode === "unavailable"
  useOperationToast(state)
  useUnsavedChanges(form.formState.isDirty && !unavailable)

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        submit(values)
      })}
    >
      {unavailable && reason ? (
        <Alert>
          <AlertTitle>Password changes are unavailable</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      ) : null}
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Password updated" : "Password not changed"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset className="flex flex-col gap-4" disabled={unavailable || pending}>
        <Field
          label="New password"
          htmlFor="new-password"
          error={form.formState.errors.password?.message}
        >
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={form.formState.errors.password ? true : undefined}
            aria-describedby={describedBy("new-password", form.formState.errors.password?.message)}
            {...form.register("password")}
          />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="confirm-new-password"
          error={form.formState.errors.confirmPassword?.message}
        >
          <Input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={form.formState.errors.confirmPassword ? true : undefined}
            aria-describedby={describedBy(
              "confirm-new-password",
              form.formState.errors.confirmPassword?.message,
            )}
            {...form.register("confirmPassword")}
          />
        </Field>
        <Button type="submit">{pending ? "Updating password" : "Update password"}</Button>
      </fieldset>
    </form>
  )
}

export function OrganizationForm() {
  const [state, submit, pending] = useActionState(createOrganizationAction, initialOperationState)
  const form = useForm<{ name: string; slug: string }>({
    defaultValues: { name: "", slug: "" },
  })
  useOperationToast(state)
  useUnsavedChanges(form.formState.isDirty)

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        submit(values)
      })}
    >
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Organization created" : "Not created"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field label="Name" htmlFor="organization-name">
        <Input id="organization-name" {...form.register("name")} />
      </Field>
      <Field label="Slug" htmlFor="organization-slug">
        <Input id="organization-slug" {...form.register("slug")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating organization" : "Create organization"}
      </Button>
    </form>
  )
}

export function AcceptInvitationForm() {
  const [state, submit, pending] = useActionState(acceptInvitationAction, initialOperationState)
  const form = useForm<{ token: string }>({ defaultValues: { token: "" } })
  useOperationToast(state)

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        submit(values)
      })}
    >
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Invitation accepted" : "Not accepted"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field label="Invitation token" htmlFor="invitation-token">
        <Input id="invitation-token" autoComplete="off" {...form.register("token")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking invitation" : "Accept invitation"}
      </Button>
    </form>
  )
}

export function DeleteAccountForm() {
  const [state, submit, pending] = useActionState(deleteAccountAction, initialOperationState)
  const form = useForm<{ confirmation: string }>({ defaultValues: { confirmation: "" } })
  useOperationToast(state)

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        submit(values)
      })}
    >
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Account deleted" : "Account not deleted"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field label="Type delete to confirm" htmlFor="delete-confirmation">
        <Input id="delete-confirmation" autoComplete="off" {...form.register("confirmation")} />
      </Field>
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Deleting account" : "Delete account"}
      </Button>
    </form>
  )
}
