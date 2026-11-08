"use client"

import { useActionState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, describedBy } from "@/components/forms/field"
import { useOperationToast } from "@/components/forms/use-operation-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { submitContact } from "@/lib/forms/actions"
import {
  contactSchema,
  initialOperationState,
  type ContactInput,
  type OperationState,
} from "@/lib/forms/schemas"

type ContactAction = (state: OperationState, values: ContactInput) => Promise<OperationState>

export function ContactForm({ action = submitContact }: { action?: ContactAction }) {
  const [state, submit, pending] = useActionState(action, initialOperationState)
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", message: "", companyWebsite: "" },
  })
  useOperationToast(state)

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit((values) => {
          submit(values)
        })(event)
      }}
    >
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Message received" : "Message not sent"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        {...form.register("companyWebsite")}
      />
      <Field label="Name" htmlFor="contact-name" error={form.formState.errors.name?.message}>
        <Input
          id="contact-name"
          autoComplete="name"
          aria-invalid={form.formState.errors.name ? true : undefined}
          aria-describedby={describedBy("contact-name", form.formState.errors.name?.message)}
          {...form.register("name")}
        />
      </Field>
      <Field label="Email" htmlFor="contact-email" error={form.formState.errors.email?.message}>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          aria-invalid={form.formState.errors.email ? true : undefined}
          aria-describedby={describedBy("contact-email", form.formState.errors.email?.message)}
          {...form.register("email")}
        />
      </Field>
      <Field
        label="Message"
        htmlFor="contact-message"
        error={form.formState.errors.message?.message}
      >
        <Textarea
          id="contact-message"
          aria-invalid={form.formState.errors.message ? true : undefined}
          aria-describedby={describedBy("contact-message", form.formState.errors.message?.message)}
          {...form.register("message")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking message" : "Send message"}
      </Button>
    </form>
  )
}
