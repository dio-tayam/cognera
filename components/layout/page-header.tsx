import type { ReactNode } from "react"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-2xl flex-col gap-2">
        {eyebrow ? (
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-brand" /> {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-[2.6rem] sm:leading-[1.08]">
          {title}
        </h1>
        {description ? (
          <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}
