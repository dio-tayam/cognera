import type { ReactNode } from "react"
import Image from "next/image"
import type { ContentBlock, ContentSpan } from "@/lib/cms/document"

export function ContentView({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  )
}

function BlockView({ block }: { block: ContentBlock }) {
  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h2" : "h3"
    return (
      <Tag
        className={
          block.level === 2
            ? "font-heading text-2xl font-semibold"
            : "font-heading text-xl font-semibold"
        }
      >
        <SpanView spans={block.spans} />
      </Tag>
    )
  }
  if (block.type === "quote") {
    return (
      <blockquote className="border-l-2 border-border pl-4 text-muted-foreground">
        <SpanView spans={block.spans} />
      </blockquote>
    )
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul"
    return (
      <Tag className={block.ordered ? "list-decimal pl-5" : "list-disc pl-5"}>
        {block.items.map((item, index) => (
          <li key={index}>
            <SpanView spans={item} />
          </li>
        ))}
      </Tag>
    )
  }
  if (block.type === "image") {
    return (
      <Image
        src={`/api/media/${block.mediaId}`}
        alt={block.alt}
        width={1200}
        height={800}
        unoptimized
        className="h-auto max-w-full rounded-lg border border-border"
      />
    )
  }
  return (
    <p className="leading-7">
      <SpanView spans={block.spans} />
    </p>
  )
}

function SpanView({ spans }: { spans: ContentSpan[] }) {
  return spans.map((span, index) => {
    let node: ReactNode = span.text
    if (span.href) {
      const external = !span.href.startsWith("/")
      node = (
        <a
          href={span.href}
          className="text-primary underline-offset-4 hover:underline"
          {...(external ? { rel: "noreferrer noopener", target: "_blank" } : {})}
        >
          {span.text}
        </a>
      )
    }
    if (span.italic) node = <em>{node}</em>
    if (span.bold) node = <strong>{node}</strong>
    return <span key={index}>{node}</span>
  })
}
