import { cn } from "cn"

const tones = {
  info: "border-info/30 bg-info/10 text-info-foreground",
  warning: "border-warning/30 bg-warning/10 text-warning-foreground",
  success: "border-success/30 bg-success/10 text-success-foreground",
} as const

export function StatusNote({ tone, children }: { tone: keyof typeof tones; children: string }) {
  return (
    <p role="status" className={cn("rounded-lg border px-3 py-2 text-sm leading-6", tones[tone])}>
      {children}
    </p>
  )
}
