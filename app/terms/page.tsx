import type { Metadata } from "next"
import { ProsePage } from "@/components/content/prose-page"
import { termsSections } from "@/lib/content/marketing"

export const metadata: Metadata = { title: "Terms" }

export default function TermsPage() {
  return (
    <ProsePage
      title="Terms"
      description="These terms apply to using this Cognera AI installation."
      sections={termsSections}
    />
  )
}
