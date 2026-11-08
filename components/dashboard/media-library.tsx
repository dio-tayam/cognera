"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
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

type Item = { id: string; filename: string; contentType: string; byteSize: number }

export function MediaLibrary() {
  const [items, setItems] = useState<Item[]>([])
  const [message, setMessage] = useState("")
  const [query, setQuery] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const response = await fetch("/api/media")
    if (!response.ok) {
      setMessage("The media library could not be loaded.")
      return
    }
    const body = (await response.json()) as { data: { items: Item[] } }
    setItems(body.data.items)
    setMessage("")
  }

  const visible = items.filter((item) =>
    item.filename.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          void upload(data)
          event.currentTarget.reset()
        }}
      >
        <Input
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          aria-label="Image file"
        />
        <Button type="submit">Upload</Button>
      </form>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Filter files"
        placeholder="Filter by filename"
      />
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <Image
              src={`/api/media/${item.id}`}
              alt={item.filename}
              width={640}
              height={360}
              unoptimized
              className="max-h-40 w-full object-contain"
            />
            <p className="text-sm font-medium">{item.filename}</p>
            <p className="text-xs text-muted-foreground">
              {item.contentType} · {item.byteSize} bytes
            </p>
            <p className="font-mono text-xs">{item.id}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingDelete(item)}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.filename} will be removed from this organization.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const item = pendingDelete
                setPendingDelete(null)
                if (!item) return
                void fetch(`/api/media/${item.id}`, { method: "DELETE" }).then(async (response) => {
                  if (!response.ok) setMessage("The file could not be deleted.")
                  await load()
                })
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  async function upload(data: FormData) {
    const response = await fetch("/api/media", { method: "POST", body: data })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      setMessage(body?.error?.message ?? "The file was not uploaded.")
      return
    }
    await load()
  }
}
