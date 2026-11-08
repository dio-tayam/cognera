import type { ReactNode } from "react"

/** Shared hero band for public pages: eyebrow, large title with optional serif accent, intro. */
export function MarketingPage({
  eyebrow,
  title,
  accent,
  description,
  children,
  actions,
  narrow = false,
}: {
  eyebrow: string
  title: string
  accent?: string
  description: string
  children: ReactNode
  actions?: ReactNode
  narrow?: boolean
}) {
  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(70%_80%_at_50%_0%,black,transparent)]" aria-hidden="true" />
        <div className="animate-rise relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-16 md:px-8 md:py-24">
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-brand" /> {eyebrow}
          </p>
          <h1 className="max-w-4xl text-4xl leading-[1.04] font-bold tracking-[-0.05em] sm:text-6xl">
            {title}
            {accent ? (
              <>
                {" "}
                <span className="text-gradient">{accent}</span>
              </>
            ) : null}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>
          {actions ? <div className="flex flex-wrap gap-3 pt-2">{actions}</div> : null}
        </div>
      </section>
      <div className="mx-auto w-full max-w-7xl px-4 py-16 md:px-8">
        <div className={narrow ? "flex max-w-2xl flex-col gap-8" : "flex flex-col gap-16"}>{children}</div>
      </div>
    </>
  )
}
