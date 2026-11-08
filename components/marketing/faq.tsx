"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "cn"

const items = [
  {
    q: "Do I need an OpenAI or other paid API key?",
    a: "No. Cognera uses Ollama running on your own computer or server. There is no API key, no per-token bill, and Cognera never silently switches to a paid provider.",
  },
  {
    q: "What happens if Ollama is offline?",
    a: "Everything else keeps working — leads, content, workflows and analytics. AI screens show the real connection error and how to fix it.",
  },
  {
    q: "Which model should I download?",
    a: "Run npm run ai:check. It reads your RAM and suggests a model, from llama3.2:1b on small laptops to qwen2.5:14b on 32 GB machines. Nothing downloads without your explicit yes.",
  },
  {
    q: "Can the AI publish or send things on its own?",
    a: "No. AI output is editable text for a person to review. Publishing, sending email and permission changes go through allowlisted actions with server-side role checks, and consequential ones need an explicitly configured workflow.",
  },
  {
    q: "Is it safe against prompt injection?",
    a: "Cognera separates trusted instructions from untrusted data, redacts secrets, strips unsafe HTML and flags suspicious input. No defense is perfect, which is why access control never depends on what the model says.",
  },
  {
    q: "Are my prompts stored?",
    a: "No. Usage tracking keeps the operation, model, sizes and timings for your organization — not prompt or output text.",
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="divide-y rounded-3xl border bg-card">
      {items.map((item, index) => {
        const expanded = open === index
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`faq-${index}`}
                onClick={() => setOpen(expanded ? null : index)}
                className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left font-heading text-lg font-semibold tracking-tight transition hover:text-brand"
              >
                {item.q}
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border transition duration-300",
                    expanded && "rotate-45 border-transparent bg-foreground text-background",
                  )}
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </h3>
            <div
              id={`faq-${index}`}
              role="region"
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <p className="overflow-hidden px-6 leading-7 text-muted-foreground">
                <span className="block pb-6">{item.a}</span>
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
