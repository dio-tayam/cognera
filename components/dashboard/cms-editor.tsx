"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { ContentView } from "@/components/content/content-view"
import { useUnsavedChanges } from "@/components/forms/use-unsaved-changes"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  emptyDocument,
  type ContentBlock,
  type ContentDocument,
  type ContentSpan,
} from "@/lib/cms/document"
import { contentDocumentSchema } from "@/lib/cms/document"

type Kind = "page" | "post"
type SaveState = "saved" | "unsaved" | "saving" | "error"

type Entry = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  document: ContentDocument
  status: string
  categoryId: string | null
  tagIds: string[]
  featuredMediaId: string | null
  seoTitle: string | null
  metaDescription: string | null
  canonicalUrl: string | null
  publishAt: string | null
}

type FormState = {
  id: string | null
  title: string
  slug: string
  excerpt: string
  document: ContentDocument
  categoryId: string
  tagIds: string[]
  featuredMediaId: string
  seoTitle: string
  metaDescription: string
  canonicalUrl: string
  status: string
  publishAt: string
}

type Taxonomy = { id: string; name: string; slug: string }
type Revision = { id: string; createdAt: string | null }

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function blankForm(): FormState {
  return {
    id: null,
    title: "",
    slug: "",
    excerpt: "",
    document: emptyDocument(),
    categoryId: "",
    tagIds: [],
    featuredMediaId: "",
    seoTitle: "",
    metaDescription: "",
    canonicalUrl: "",
    status: "draft",
    publishAt: "",
  }
}

function fromEntry(entry: Entry): FormState {
  return {
    id: entry.id,
    title: entry.title,
    slug: entry.slug,
    excerpt: entry.excerpt ?? "",
    document: entry.document,
    categoryId: entry.categoryId ?? "",
    tagIds: entry.tagIds,
    featuredMediaId: entry.featuredMediaId ?? "",
    seoTitle: entry.seoTitle ?? "",
    metaDescription: entry.metaDescription ?? "",
    canonicalUrl: entry.canonicalUrl ?? "",
    status: entry.status,
    publishAt: entry.publishAt ? toLocalInput(entry.publishAt) : "",
  }
}

function toLocalInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function payload(form: FormState) {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    excerpt: form.excerpt.trim() || null,
    document: form.document,
    categoryId: form.categoryId || null,
    tagIds: form.tagIds,
    featuredMediaId: form.featuredMediaId.trim() || null,
    seoTitle: form.seoTitle.trim() || null,
    metaDescription: form.metaDescription.trim() || null,
    canonicalUrl: form.canonicalUrl.trim() || null,
    publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
  }
}

function problems(form: FormState): string[] {
  const issues: string[] = []
  if (!form.title.trim()) issues.push("Add a title.")
  if (!slugPattern.test(form.slug.trim())) issues.push("Use a lowercase slug with hyphens.")
  if (form.excerpt.trim().length > 300) issues.push("Keep the excerpt to 300 characters.")
  if (form.seoTitle.trim().length > 70) issues.push("Keep the SEO title to 70 characters.")
  if (form.metaDescription.trim().length > 160)
    issues.push("Keep the meta description to 160 characters.")
  if (form.canonicalUrl.trim() && !form.canonicalUrl.trim().startsWith("https://")) {
    issues.push("Canonical URLs must start with https://.")
  }
  const document = contentDocumentSchema.safeParse(form.document)
  if (!document.success) issues.push("The content blocks are not valid.")
  if (form.featuredMediaId.trim() && !/^[0-9a-f-]{36}$/i.test(form.featuredMediaId.trim())) {
    issues.push("Featured image must be a media id from the library.")
  }
  return issues
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  return body?.error?.message ?? "The content could not be saved."
}

export function CmsEditor({ kind }: { kind: Kind }) {
  const collection = kind === "page" ? "pages" : "posts"
  const [entries, setEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<Taxonomy[]>([])
  const [tags, setTags] = useState<Taxonomy[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [form, setForm] = useState<FormState>(blankForm)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [message, setMessage] = useState("")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [preview, setPreview] = useState(false)
  const [focus, setFocus] = useState<{ block: number; item: number | null; span: number }>({
    block: 0,
    item: null,
    span: 0,
  })
  const [canPublish, setCanPublish] = useState(false)
  const [confirming, setConfirming] = useState<null | { label: string; run: () => Promise<void> }>(
    null,
  )
  const formRef = useRef(form)

  useUnsavedChanges(saveState === "unsaved" || saveState === "error")

  const refreshLists = useCallback(async () => {
    const [content, categoryResponse, tagResponse] = await Promise.all([
      fetch(`/api/cms/${collection}`),
      fetch("/api/cms/categories"),
      fetch("/api/cms/tags"),
    ])
    if (content.ok) {
      const body = (await content.json()) as {
        data: { items: Entry[]; permissions: { canPublish: boolean } }
      }
      setEntries(body.data.items)
      setCanPublish(body.data.permissions.canPublish)
    }
    if (categoryResponse.ok) {
      const body = (await categoryResponse.json()) as { data: { categories: Taxonomy[] } }
      setCategories(body.data.categories)
    }
    if (tagResponse.ok) {
      const body = (await tagResponse.json()) as { data: { tags: Taxonomy[] } }
      setTags(body.data.tags)
    }
  }, [collection])

  const loadRevisions = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/cms/${collection}/${id}/revisions`)
      if (!response.ok) return
      const body = (await response.json()) as { data: { revisions: Revision[] } }
      setRevisions(body.data.revisions)
    },
    [collection],
  )

  const persist = useCallback(
    async (serialized: string) => {
      const current = formRef.current
      const issues = problems(current)
      if (issues.length > 0) {
        setSaveState("error")
        setMessage(issues[0] ?? "Check the content.")
        return
      }
      setSaveState("saving")
      const body = JSON.stringify(payload(current))
      const response = current.id
        ? await fetch(`/api/cms/${collection}/${current.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body,
          })
        : await fetch(`/api/cms/${collection}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          })
      if (!response.ok) {
        setSaveState("error")
        setMessage(await readError(response))
        return
      }
      const saved = (await response.json()) as { data: { entry: Entry } }
      const stillCurrent = JSON.stringify(payload(formRef.current)) === serialized
      if (stillCurrent) {
        const next = fromEntry(saved.data.entry)
        formRef.current = next
        setForm(next)
        setSaveState("saved")
        setMessage("")
      } else {
        const next = {
          ...formRef.current,
          id: saved.data.entry.id,
          status: saved.data.entry.status,
        }
        formRef.current = next
        setForm(next)
        setSaveState("unsaved")
      }
      await refreshLists()
      if (saved.data.entry.id) await loadRevisions(saved.data.entry.id)
    },
    [collection, loadRevisions, refreshLists],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [content, categoryResponse, tagResponse] = await Promise.all([
        fetch(`/api/cms/${collection}`),
        fetch("/api/cms/categories"),
        fetch("/api/cms/tags"),
      ])
      if (cancelled) return
      if (content.ok) {
        const body = (await content.json()) as {
          data: { items: Entry[]; permissions: { canPublish: boolean } }
        }
        setEntries(body.data.items)
        setCanPublish(body.data.permissions.canPublish)
      }
      if (cancelled) return
      if (categoryResponse.ok) {
        const body = (await categoryResponse.json()) as { data: { categories: Taxonomy[] } }
        setCategories(body.data.categories)
      }
      if (cancelled) return
      if (tagResponse.ok) {
        const body = (await tagResponse.json()) as { data: { tags: Taxonomy[] } }
        setTags(body.data.tags)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [collection])

  useEffect(() => {
    if (saveState !== "unsaved") return
    const serialized = JSON.stringify(payload(form))
    const timer = window.setTimeout(() => {
      void persist(serialized)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [form, persist, saveState])

  function edit(next: Partial<FormState>) {
    const updated = { ...formRef.current, ...next }
    formRef.current = updated
    setForm(updated)
    setSaveState("unsaved")
    setMessage("")
  }

  function updateDocument(document: ContentDocument) {
    edit({ document })
  }

  async function openEntry(entry: Entry) {
    if (saveState === "unsaved" || saveState === "error") {
      const leave = window.confirm("You have unsaved changes. Leave this page without saving?")
      if (!leave) return
    }
    const next = fromEntry(entry)
    formRef.current = next
    setForm(next)
    setSaveState("saved")
    setMessage("")
    setPreview(false)
    await loadRevisions(entry.id)
  }

  async function changeStatus(status: string) {
    if (!form.id) {
      setMessage("Save the draft before changing its status.")
      setSaveState("error")
      return
    }
    const response = await fetch(`/api/cms/${collection}/${form.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
      }),
    })
    if (!response.ok) {
      setMessage(await readError(response))
      setSaveState("error")
      return
    }
    const saved = (await response.json()) as { data: { entry: Entry } }
    const next = fromEntry(saved.data.entry)
    formRef.current = next
    setForm(next)
    setSaveState("saved")
    setMessage("")
    await refreshLists()
    await loadRevisions(saved.data.entry.id)
  }

  function ask(label: string, run: () => Promise<void>) {
    setConfirming({ label, run })
  }

  const visible = entries.filter((entry) => {
    const matchesStatus = statusFilter === "all" || entry.status === statusFilter
    const haystack = `${entry.title} ${entry.slug}`.toLowerCase()
    return matchesStatus && haystack.includes(query.trim().toLowerCase())
  })
  const issues = problems(form)
  const indicator =
    saveState === "saving"
      ? "Saving…"
      : saveState === "unsaved"
        ? "Unsaved changes"
        : saveState === "error"
          ? "Not saved"
          : "Saved"

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            formRef.current = blankForm()
            setForm(formRef.current)
            setRevisions([])
            setSaveState("saved")
            setPreview(false)
          }}
        >
          New {kind}
        </Button>
        <Label htmlFor="cms-search">Filter</Label>
        <Input
          id="cms-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title or slug"
        />
        <Label htmlFor="cms-status-filter">Status</Label>
        <select
          id="cms-status-filter"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All</option>
          {["draft", "review", "scheduled", "published", "archived"].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <ul className="flex flex-col gap-1">
          {visible.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => void openEntry(entry)}
              >
                <span className="block font-medium">{entry.title}</span>
                <span className="text-muted-foreground">
                  {entry.status} · {entry.slug}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void persist(JSON.stringify(payload(formRef.current)))
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" role="status">
            {indicator}
            {message ? ` · ${message}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPreview((value) => !value)}>
              {preview ? "Edit" : "Preview"}
            </Button>
            <Button type="submit">Save now</Button>
          </div>
        </div>
        {issues.length > 0 && saveState === "error" ? (
          <ul className="text-sm text-destructive">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title" value={form.title} onChange={(title) => edit({ title })} />
          <Field label="Slug" value={form.slug} onChange={(slug) => edit({ slug })} />
          <Field label="Excerpt" value={form.excerpt} onChange={(excerpt) => edit({ excerpt })} />
          <Field
            label="SEO title"
            value={form.seoTitle}
            onChange={(seoTitle) => edit({ seoTitle })}
          />
          <Field
            label="Meta description"
            value={form.metaDescription}
            onChange={(metaDescription) => edit({ metaDescription })}
          />
          <Field
            label="Canonical URL"
            value={form.canonicalUrl}
            onChange={(canonicalUrl) => edit({ canonicalUrl })}
          />
          <Field
            label="Featured image id"
            value={form.featuredMediaId}
            onChange={(featuredMediaId) => edit({ featuredMediaId })}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cms-category">Category</Label>
            <select
              id="cms-category"
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              value={form.categoryId}
              onChange={(event) => edit({ categoryId: event.target.value })}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Tags</legend>
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.tagIds.includes(tag.id)}
                onChange={(event) => {
                  const tagIds = event.target.checked
                    ? [...form.tagIds, tag.id]
                    : form.tagIds.filter((id) => id !== tag.id)
                  edit({ tagIds })
                }}
              />
              {tag.name}
            </label>
          ))}
          <TaxonomyCreate
            label="tag"
            onCreate={async (name, slug) => {
              const response = await fetch("/api/cms/tags", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, slug }),
              })
              if (!response.ok) setMessage(await readError(response))
              await refreshLists()
            }}
          />
          <TaxonomyCreate
            label="category"
            onCreate={async (name, slug) => {
              const response = await fetch("/api/cms/categories", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, slug }),
              })
              if (!response.ok) setMessage(await readError(response))
              await refreshLists()
            }}
          />
        </fieldset>
        {preview ? (
          <div className="rounded-xl border border-border p-4">
            <h1 className="font-heading text-3xl font-bold">{form.title || "Untitled"}</h1>
            <ContentView blocks={form.document.blocks} />
          </div>
        ) : (
          <BlockEditor
            document={form.document}
            focus={focus}
            onFocus={setFocus}
            onChange={updateDocument}
          />
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="cms-publish-at">Publish at</Label>
          <Input
            id="cms-publish-at"
            type="datetime-local"
            value={form.publishAt}
            onChange={(event) => edit({ publishAt: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => ask("Submit this for review?", () => changeStatus("review"))}
          >
            Submit for review
          </Button>
          {canPublish ? (
            <>
              <Button
                type="button"
                onClick={() => ask("Publish this now?", () => changeStatus("published"))}
              >
                Publish
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  ask("Schedule publication at the chosen time?", () => changeStatus("scheduled"))
                }
              >
                Schedule
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  ask("Unpublish this and return it to draft?", () => changeStatus("draft"))
                }
              >
                Unpublish
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => ask("Archive this?", () => changeStatus("archived"))}
              >
                Archive
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => ask("Restore this to draft?", () => changeStatus("draft"))}
              >
                Restore
              </Button>
            </>
          ) : null}
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-bold">Revisions</h2>
          <ul className="flex flex-col gap-2">
            {revisions.map((revision) => (
              <li key={revision.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {revision.createdAt ? new Date(revision.createdAt).toLocaleString() : "Revision"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    ask("Restore this revision? The current status stays the same.", async () => {
                      if (!form.id) return
                      const response = await fetch(
                        `/api/cms/${collection}/${form.id}/revisions/${revision.id}`,
                        {
                          method: "POST",
                        },
                      )
                      if (!response.ok) {
                        setMessage(await readError(response))
                        setSaveState("error")
                        return
                      }
                      const saved = (await response.json()) as { data: { entry: Entry } }
                      const next = fromEntry(saved.data.entry)
                      formRef.current = next
                      setForm(next)
                      setSaveState("saved")
                      await loadRevisions(saved.data.entry.id)
                      await refreshLists()
                    })
                  }
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </form>
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                const action = confirming
                setConfirming(null)
                if (action) void action.run()
              }}
            >
              Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = `cms-${label.toLowerCase().replace(/\s+/g, "-")}`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function TaxonomyCreate({
  label,
  onCreate,
}: {
  label: string
  onCreate: (name: string, slug: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        aria-label={`${label} name`}
        value={name}
        placeholder={`${label} name`}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        aria-label={`${label} slug`}
        value={slug}
        placeholder={`${label} slug`}
        onChange={(event) => setSlug(event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void onCreate(name, slug).then(() => {
            setName("")
            setSlug("")
          })
        }}
      >
        Add {label}
      </Button>
    </div>
  )
}

function BlockEditor({
  document,
  focus,
  onFocus,
  onChange,
}: {
  document: ContentDocument
  focus: { block: number; item: number | null; span: number }
  onFocus: (focus: { block: number; item: number | null; span: number }) => void
  onChange: (document: ContentDocument) => void
}) {
  function toggle(mark: "bold" | "italic") {
    const blocks = document.blocks.map((block, blockIndex) => {
      if (blockIndex !== focus.block || block.type === "image") return block
      if (block.type === "list") {
        return {
          ...block,
          items: block.items.map((item, itemIndex) =>
            itemIndex === focus.item
              ? item.map((span, spanIndex) =>
                  spanIndex === focus.span ? { ...span, [mark]: !span[mark] } : span,
                )
              : item,
          ),
        }
      }
      return {
        ...block,
        spans: block.spans.map((span, spanIndex) =>
          spanIndex === focus.span ? { ...span, [mark]: !span[mark] } : span,
        ),
      }
    })
    onChange({ version: 1, blocks })
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey)) return
    const key = event.key.toLowerCase()
    if (key === "b" || key === "i") {
      event.preventDefault()
      toggle(key === "b" ? "bold" : "italic")
    }
  }

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Content formatting">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => toggle("bold")}
          aria-keyshortcuts="Ctrl+B Meta+B"
        >
          Bold
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => toggle("italic")}
          aria-keyshortcuts="Ctrl+I Meta+I"
        >
          Italic
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock({ type: "heading", level: 2, spans: [{ text: "" }] })}
        >
          Heading
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock({ type: "paragraph", spans: [{ text: "" }] })}
        >
          Paragraph
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock({ type: "list", ordered: false, items: [[{ text: "" }]] })}
        >
          List
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock({ type: "quote", spans: [{ text: "" }] })}
        >
          Quote
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock({ type: "image", mediaId: "", alt: "" })}
        >
          Image
        </Button>
      </div>
      {document.blocks.map((block, blockIndex) => (
        <BlockFields
          key={blockIndex}
          block={block}
          onFocusSpan={(item, span) => onFocus({ block: blockIndex, item, span })}
          onChange={(next) => {
            const blocks = document.blocks.map((item, index) =>
              index === blockIndex ? next : item,
            )
            onChange({ version: 1, blocks })
          }}
          onRemove={() =>
            onChange({
              version: 1,
              blocks: document.blocks.filter((_, index) => index !== blockIndex),
            })
          }
        />
      ))}
    </div>
  )

  function addBlock(block: ContentBlock) {
    onChange({ version: 1, blocks: [...document.blocks, block] })
  }
}

function BlockFields({
  block,
  onChange,
  onFocusSpan,
  onRemove,
}: {
  block: ContentBlock
  onChange: (block: ContentBlock) => void
  onFocusSpan: (item: number | null, span: number) => void
  onRemove: () => void
}) {
  if (block.type === "image") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Label>Image</Label>
        <Input
          aria-label="Image media id"
          value={block.mediaId}
          onChange={(event) => onChange({ ...block, mediaId: event.target.value })}
        />
        <Input
          aria-label="Image description"
          value={block.alt}
          onChange={(event) => onChange({ ...block, alt: event.target.value })}
        />
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Remove block
        </Button>
      </div>
    )
  }
  if (block.type === "list") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={block.ordered}
            onChange={(event) => onChange({ ...block, ordered: event.target.checked })}
          />
          Numbered list
        </label>
        {block.items.map((item, itemIndex) => (
          <Input
            key={itemIndex}
            aria-label={`List item ${itemIndex + 1}`}
            value={item[0]?.text ?? ""}
            onFocus={() => onFocusSpan(itemIndex, 0)}
            onChange={(event) => {
              const items = block.items.map((spans, index) =>
                index === itemIndex
                  ? [{ ...(spans[0] ?? { text: "" }), text: event.target.value }]
                  : spans,
              )
              onChange({ ...block, items })
            }}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...block, items: [...block.items, [{ text: "" }]] })}
        >
          Add item
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Remove block
        </Button>
      </div>
    )
  }
  const span = block.spans[0] ?? { text: "" }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <Label>{block.type === "heading" ? `Heading ${block.level}` : block.type}</Label>
      <Input
        aria-label={block.type}
        value={span.text}
        onFocus={() => onFocusSpan(null, 0)}
        onChange={(event) => onChange({ ...block, spans: [{ ...span, text: event.target.value }] })}
      />
      <Input
        aria-label={`${block.type} link`}
        placeholder="https:// or /path"
        value={span.href ?? ""}
        onFocus={() => onFocusSpan(null, 0)}
        onChange={(event) => {
          const href = event.target.value
          const next: ContentSpan = { ...span, ...(href ? { href } : {}) }
          if (!href) delete next.href
          onChange({ ...block, spans: [next] })
        }}
      />
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
        Remove block
      </Button>
    </div>
  )
}
