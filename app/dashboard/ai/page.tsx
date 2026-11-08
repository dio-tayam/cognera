import type { Metadata } from "next"
import { AiWorkspace } from "@/components/ai/ai-workspace"

export const metadata: Metadata = { title: "AI workspace" }

export default function AiWorkspacePage() {
  return (
    <AiWorkspace
      header={
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-brand" /> Local AI · Ollama
          </p>
          <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-[2.6rem] sm:leading-[1.08]">AI workspace</h1>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Draft emails, summarize and classify leads, outline posts, and transform text with a model running on
            your own hardware. Every result is editable and nothing is sent or published for you.
          </p>
        </div>
      }
    />
  )
}
