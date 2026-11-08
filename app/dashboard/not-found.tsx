import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"

export default function DashboardNotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="That application address does not exist." />
      <Link
        href="/dashboard"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Back to overview
      </Link>
    </>
  )
}
