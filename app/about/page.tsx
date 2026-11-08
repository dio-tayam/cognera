import type { Metadata } from "next"
import { ProsePage } from "@/components/content/prose-page"
import { aboutSections } from "@/lib/content/marketing"

export const metadata: Metadata = { title: "About" }

export default function AboutPage() {
  return (
    <ProsePage
      title="About"
      description="Cognera AI helps businesses automate work and manage content. This release is the shared product interface on top of the secure foundation."
      sections={aboutSections}
    />
  )
}
