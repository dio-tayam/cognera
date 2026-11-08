import { Badge } from "@/components/ui/badge"
import { statusLabels } from "@/components/workflows/api"

const variants: Record<
  string,
  "success" | "destructive" | "warning" | "info" | "outline" | "secondary"
> = {
  succeeded: "success",
  failed: "destructive",
  retry_scheduled: "warning",
  running: "info",
  queued: "secondary",
  cancelled: "outline",
  skipped: "outline",
}

export function RunStatusBadge({
  status,
  deadLettered,
}: {
  status: string
  deadLettered?: boolean
}) {
  return (
    <Badge variant={variants[status] ?? "outline"}>
      {statusLabels[status] ?? status}
      {deadLettered ? " · dead letter" : ""}
    </Badge>
  )
}
