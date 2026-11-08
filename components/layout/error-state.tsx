import Link from "next/link"
import { Button } from "@/components/ui/button"

export function ErrorState({
  title,
  message,
  digest,
  onRetry,
}: {
  title: string
  message: string
  digest?: string
  onRetry?: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-heading text-3xl font-bold">{title}</h1>
      <p role="alert">{message}</p>
      {digest ? <p className="text-sm text-muted-foreground">Reference {digest}</p> : null}
      <div className="flex flex-wrap gap-3">
        {onRetry ? (
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        <Link
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
