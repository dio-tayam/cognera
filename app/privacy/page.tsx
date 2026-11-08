import type { Metadata } from "next"
import { ProsePage } from "@/components/content/prose-page"
import { privacySections } from "@/lib/content/marketing"

export const metadata: Metadata = { title: "Privacy" }

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy"
      description="This page describes what this installation actually handles. It does not describe a future analytics product."
      sections={privacySections}
    />
  )
}
