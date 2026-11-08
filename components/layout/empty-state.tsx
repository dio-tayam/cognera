import type { ReactNode } from "react"

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed px-4 py-8">
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}
