"use client"

import { useState } from "react"
import { useActionState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, describedBy } from "@/components/forms/field"
import { useOperationToast } from "@/components/forms/use-operation-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveDocumentDraft } from "@/lib/forms/actions"
import {
  documentDraftSchema,
  initialOperationState,
  type DocumentDraftInput,
} from "@/lib/forms/schemas"

export function DocumentDraftDialog({ label }: { label: string }) {
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState(saveDocumentDraft, initialOperationState)
  const form = useForm<DocumentDraftInput>({
    resolver: zodResolver(documentDraftSchema),
    defaultValues: { title: "", summary: "" },
  })
  useOperationToast(state)

  function requestClose(next: boolean) {
    if (!next && form.formState.isDirty) {
      const leave = window.confirm("You have unsaved changes. Close this draft without saving?")
      if (!leave) return
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogTrigger render={<Button type="button" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Content storage is not connected. A valid draft is not saved.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            submit(values)
          })}
        >
          {state.message ? (
            <Alert variant="destructive">
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <Field label="Title" htmlFor="draft-title" error={form.formState.errors.title?.message}>
            <Input
              id="draft-title"
              aria-invalid={form.formState.errors.title ? true : undefined}
              aria-describedby={describedBy("draft-title", form.formState.errors.title?.message)}
              {...form.register("title")}
            />
          </Field>
          <Field
            label="Summary"
            htmlFor="draft-summary"
            error={form.formState.errors.summary?.message}
          >
            <Textarea
              id="draft-summary"
              aria-invalid={form.formState.errors.summary ? true : undefined}
              aria-describedby={describedBy(
                "draft-summary",
                form.formState.errors.summary?.message,
              )}
              {...form.register("summary")}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Checking draft" : "Save draft"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
