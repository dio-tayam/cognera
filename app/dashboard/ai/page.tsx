import type { Metadata } from "next"
import { AiWorkspace } from "@/components/ai/ai-workspace"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "AI workspace" }

export default function AiWorkspacePage() {
  return (
    <>
      <PageHeader
        eyebrow="Local AI · Ollama"
        title="AI workspace"
        description="Draft emails, summarize and classify leads, outline posts, and transform text with a model running on your own hardware. Every result is editable and nothing is sent or published for you."
      />
      <AiWorkspace />
    </>
  )
}
