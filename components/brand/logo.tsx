import { cn } from "cn"

/**
 * Cognera mark: an open "C" ring with one node sitting in the opening —
 * a cycle with a step about to run. Ring uses currentColor; the node is the accent.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <path
        d="M24.4 9 A11 11 0 1 0 24.4 23"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <circle cx="27.4" cy="16" r="3.3" fill="var(--brand)" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-heading text-[1.4rem] leading-none font-bold tracking-[-0.055em]">cognera</span>
    </span>
  )
}
