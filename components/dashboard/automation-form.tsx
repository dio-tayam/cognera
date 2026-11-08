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
import { Textarea } from "@/components/ui/textarea"
import { saveAutomationDraft } from "@/lib/forms/actions"
import {
  automationDraftSchema,
  initialOperationState,
  type AutomationDraftInput,
  type OperationState,
} from "@/lib/forms/schemas"

const triggers = [
  { value: "Manual", label: "Manual" },
  { value: "Schedule", label: "Schedule" },
  { value: "Webhook", label: "Webhook" },
] as const

export function AutomationForm({
  action = saveAutomationDraft,
}: {
  action?: (state: OperationState, values: AutomationDraftInput) => Promise<OperationState>
}) {
  const [state, submit, pending] = useActionState(action, initialOperationState)
  const form = useForm<AutomationDraftInput>({
    resolver: zodResolver(automationDraftSchema),
    defaultValues: { name: "", trigger: "Manual", description: "" },
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
          <AlertTitle>{state.status === "success" ? "Saved" : "Not saved"}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field label="Name" htmlFor="automation-name" error={form.formState.errors.name?.message}>
        <Input
          id="automation-name"
          aria-invalid={form.formState.errors.name ? true : undefined}
          aria-describedby={describedBy("automation-name", form.formState.errors.name?.message)}
          {...form.register("name")}
        />
      </Field>
      <Field
        label="Trigger"
        htmlFor="automation-trigger"
        error={form.formState.errors.trigger?.message}
      >
        <Controller
          control={form.control}
          name="trigger"
          render={({ field }) => (
            <Select
              items={triggers}
              value={field.value}
              onValueChange={(value) => {
                if (value) field.onChange(value)
              }}
            >
              <SelectTrigger id="automation-trigger" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {triggers.map((trigger) => (
                  <SelectItem key={trigger.value} value={trigger.value}>
                    {trigger.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field
        label="Description"
        htmlFor="automation-description"
        error={form.formState.errors.description?.message}
      >
        <Textarea
          id="automation-description"
          aria-invalid={form.formState.errors.description ? true : undefined}
          aria-describedby={describedBy(
            "automation-description",
            form.formState.errors.description?.message,
          )}
          {...form.register("description")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking draft" : "Save draft"}
      </Button>
    </form>
  )
}
