import type { ReactNode } from "react"
import { cn } from "cn"

export function PageContainer({
  children,
  size = "default",
}: {
  children: ReactNode
  size?: "default" | "narrow"
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-10 px-4 py-12 md:px-8 md:py-16",
        size === "narrow" ? "max-w-xl" : "max-w-6xl",
      )}
    >
      {children}
    </div>
  )
}
