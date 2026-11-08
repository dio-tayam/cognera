import type { ReactNode } from "react"

export function SectionBlock({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-[-0.035em]">{title}</h2>
        {description ? <p className="leading-7 text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}
