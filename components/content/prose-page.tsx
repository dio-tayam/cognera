import { MarketingPage } from "@/components/marketing/marketing-page"

export function ProsePage({
  title,
  description,
  sections,
}: {
  title: string
  description: string
  sections: ReadonlyArray<{ title: string; body: string }>
}) {
  return (
    <MarketingPage eyebrow={title} title={title} description={description}>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ol className="sticky top-28 flex flex-col gap-2 border-l text-sm">
            {sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#section-${index + 1}`} className="-ml-px block border-l border-transparent pl-4 text-muted-foreground transition hover:border-brand hover:text-foreground">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex max-w-3xl flex-col gap-3">
          {sections.map((section, index) => (
            <section
              key={section.title}
              id={`section-${index + 1}`}
              className="flex scroll-mt-28 gap-4 rounded-3xl border bg-card p-6 transition hover:border-brand/30"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-xs text-brand">
                {index + 1}
              </span>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xl font-bold tracking-[-0.03em]">{section.title}</h2>
                <p className="leading-7 text-muted-foreground">{section.body}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </MarketingPage>
  )
}
