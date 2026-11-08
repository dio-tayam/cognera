"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { EmptyState } from "@/components/layout/empty-state"
import { ErrorState } from "@/components/layout/error-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Lead = {
  id: string
  name: string
  email: string
  company: string | null
  phone: string | null
  source: string
  status: string
  ownerId: string | null
  createdAt: string
  updatedAt: string
}

type Note = { id: string; body: string; authorId: string; createdAt: string }
type Activity = { id: string; action: string; actorId: string; createdAt: string }
type PageData = {
  items: Lead[]
  page: number
  pageSize: number
  total: number
  pageCount: number
  permissions: { canWrite: boolean; canDelete: boolean }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

const statuses = ["", "new", "contacted", "qualified", "archived"]
const sources = ["manual", "contact_form", "referral", "import", "other"]

async function api<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })
  const body = (await response.json()) as ApiResult<T>
  return body
}

function listUrl(query: string, status: string, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "10",
    sort: "updatedAt",
    direction: "desc",
  })
  if (query) params.set("q", query)
  if (status) params.set("status", status)
  return `/api/leads?${params.toString()}`
}

export function CrmLeads() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    source: "manual",
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ lead: Lead; notes: Note[]; activity: Activity[] } | null>(
    null,
  )
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const [removing, setRemoving] = useState<Lead | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await api<PageData>(listUrl(query, status, page))
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setData(result.data)
  }, [page, query, status])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await api<PageData>(listUrl(query, status, page))
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setError(null)
      setData(result.data)
    })()
    return () => {
      cancelled = true
    }
  }, [page, query, status])

  async function openLead(id: string) {
    setOpenId(id)
    setDetail(null)
    const result = await api<{ lead: Lead; notes: Note[]; activity: Activity[] }>(
      `/api/leads/${id}`,
    )
    if (!result.ok) {
      toast.error(result.error.message)
      setOpenId(null)
      return
    }
    setDetail(result.data)
  }

  async function createLead() {
    setCreating(true)
    const result = await api<{ lead: Lead }>("/api/leads", {
      method: "POST",
      body: JSON.stringify({
        name: draft.name,
        email: draft.email,
        company: draft.company || null,
        phone: draft.phone || null,
        source: draft.source,
      }),
    })
    setCreating(false)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    toast.success("Lead created.")
    setDraft({ name: "", email: "", company: "", phone: "", source: "manual" })
    await load()
  }

  async function patchLead(id: string, body: Record<string, string | null>) {
    setPending(true)
    const result = await api<{ lead: Lead }>(`/api/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    setPending(false)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    toast.success("Lead updated.")
    await load()
    await openLead(id)
  }

  async function addNote(id: string) {
    setPending(true)
    const result = await api<{ note: Note }>(`/api/leads/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: note }),
    })
    setPending(false)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    toast.success("Note saved.")
    setNote("")
    await openLead(id)
  }

  async function removeLead(lead: Lead) {
    setPending(true)
    const result = await api<{ deleted: boolean }>(`/api/leads/${lead.id}`, { method: "DELETE" })
    setPending(false)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    toast.success("Lead deleted.")
    setRemoving(null)
    setOpenId(null)
    await load()
  }

  const exportHref = `/api/leads/export?${new URLSearchParams({
    ...(query ? { q: query } : {}),
    ...(status ? { status } : {}),
  }).toString()}`

  return (
    <div className="flex flex-col gap-6">
      {data?.permissions.canWrite ? (
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            void createLead()
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-name">Name</Label>
            <Input
              id="lead-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-company">Company</Label>
            <Input
              id="lead-company"
              value={draft.company}
              onChange={(event) => setDraft({ ...draft, company: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-phone">Phone</Label>
            <Input
              id="lead-phone"
              value={draft.phone}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-source">Source</Label>
            <select
              id="lead-source"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={draft.source}
              onChange={(event) => setDraft({ ...draft, source: event.target.value })}
            >
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={creating}>
              {creating ? "Saving lead" : "Create lead"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lead-search">Search leads</Label>
          <Input
            id="lead-search"
            type="search"
            value={query}
            onChange={(event) => {
              setLoading(true)
              setQuery(event.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lead-status">Status</Label>
          <select
            id="lead-status"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={status}
            onChange={(event) => {
              setLoading(true)
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            {statuses.map((item) => (
              <option key={item || "all"} value={item}>
                {item || "All statuses"}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
          {loading ? "Loading leads" : "Retry"}
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href={exportHref} />}>
          Export CSV
        </Button>
      </div>

      {error ? (
        <ErrorState title="Leads could not be loaded" message={error} onRetry={() => void load()} />
      ) : null}
      {loading && !data ? <p className="text-muted-foreground text-sm">Loading leads.</p> : null}
      {data && data.items.length === 0 ? (
        <EmptyState
          title="No leads are stored"
          description="Create a lead, or wait for a public contact message to arrive."
        />
      ) : null}
      {data && data.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>{lead.name}</TableCell>
                <TableCell>{lead.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{lead.status}</Badge>
                </TableCell>
                <TableCell>{lead.updatedAt.slice(0, 10)}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openLead(lead.id)}
                  >
                    View {lead.name}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {data && data.pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous page
          </Button>
          <span className="text-sm">
            Page {data.page} of {data.pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next page
          </Button>
        </div>
      ) : null}

      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{detail?.lead.name ?? "Lead"}</SheetTitle>
            <SheetDescription>Stored for the current organization.</SheetDescription>
          </SheetHeader>
          {detail ? (
            <div className="flex flex-col gap-4 px-4 text-sm">
              <dl className="grid gap-2">
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{detail.lead.email}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Company</dt>
                  <dd>{detail.lead.company ?? "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{detail.lead.phone ?? "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd>{detail.lead.source}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd>{detail.lead.ownerId ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{detail.lead.createdAt}</dd>
                </div>
              </dl>
              {data?.permissions.canWrite ? (
                <div className="flex flex-wrap gap-2">
                  {detail.lead.status === "archived" ? (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => void patchLead(detail.lead.id, { status: "new" })}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void patchLead(detail.lead.id, { status: "archived" })}
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void patchLead(detail.lead.id, { status: "contacted" })}
                  >
                    Mark contacted
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void patchLead(detail.lead.id, { status: "qualified" })}
                  >
                    Mark qualified
                  </Button>
                </div>
              ) : null}
              {data?.permissions.canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setRemoving(detail.lead)}
                >
                  Delete {detail.lead.name}
                </Button>
              ) : null}
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">Notes</h3>
                {detail.notes.length === 0 ? (
                  <p className="text-muted-foreground">No notes yet.</p>
                ) : null}
                {detail.notes.map((item) => (
                  <p key={item.id}>{item.body}</p>
                ))}
                {data?.permissions.canWrite ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void addNote(detail.lead.id)
                    }}
                  >
                    <Label htmlFor="lead-note">Add a note</Label>
                    <Textarea
                      id="lead-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <Button type="submit" disabled={pending}>
                      Save note
                    </Button>
                  </form>
                ) : null}
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">Activity</h3>
                {detail.activity.length === 0 ? (
                  <p className="text-muted-foreground">No activity yet.</p>
                ) : null}
                {detail.activity.map((item) => (
                  <p key={item.id}>
                    {item.action} · {item.createdAt.slice(0, 16).replace("T", " ")}
                  </p>
                ))}
              </section>
            </div>
          ) : (
            <p className="text-muted-foreground px-4 text-sm">Loading lead.</p>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {removing?.name ?? "the lead"} and its notes after the server
              confirms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !removing}
              onClick={() => removing && void removeLead(removing)}
            >
              {pending ? "Deleting lead" : "Delete lead"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
