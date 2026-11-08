import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { ContactForm } from "@/components/contact-form"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { getSiteConfig } from "@/lib/site"

export const metadata: Metadata = { title: "Contact" }

export default function ContactPage() {
  return (
    <MarketingPage narrow eyebrow="Contact" title="Contact" description="The form checks your message. It is saved as a lead only when a contact organization is configured. Otherwise nothing is sent.">
      <Suspense fallback={<PageSkeleton />}>
        <ContactPanel />
      </Suspense>
      <ContactForm />
    </MarketingPage>
  )
}

async function ContactPanel() {
  await connection()
  const site = getSiteConfig()
  if (!site.supportEmail) {
    return <p>Support contact is not configured. There is no mailbox for this installation.</p>
  }
  return (
    <p>
      You can email{" "}
      <a
        className="text-primary underline-offset-4 hover:underline"
        href={`mailto:${site.supportEmail}`}
      >
        {site.supportEmail}
      </a>
      . The form below still does not deliver a copy.
    </p>
  )
}
