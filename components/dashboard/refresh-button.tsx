"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

const autoInterval = 30

function timeAgo(seconds: number): string {
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

/** Re-runs the server component tree in place. Counts on this page are a snapshot, not a live feed,
 * unless auto-refresh is on, in which case it's a snapshot taken every 30 seconds. */
export function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [elapsed, setElapsed] = useState(0)
  const [auto, setAuto] = useState(false)

  const refresh = () => {
    setElapsed(0)
    startTransition(() => router.refresh())
  }

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(refresh, autoInterval * 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable enough for a fixed-interval poll
  }, [auto])

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) => setAuto(event.target.checked)}
          className="size-3.5 accent-brand"
        />
        Auto-refresh ({autoInterval}s)
      </label>
      <span className="text-xs text-muted-foreground">Updated {timeAgo(elapsed)}</span>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={refresh}>
        <RefreshCw className={cn("size-3.5", pending && "animate-spin")} /> Refresh
      </Button>
    </div>
  )
}
