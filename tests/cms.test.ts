import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { emptyDocument, parseDocument, sanitizeDocument } from "@/lib/cms/document"
import { queryPublicPage, queryPublicMediaVisible } from "@/lib/cms/public-query"
import {
  createContent,
  getContent,
  listRevisions,
  restoreRevision,
  updateContent,
} from "@/lib/cms/store"
import { readMemberMedia, readPublicMediaFile, uploadMedia } from "@/lib/media/library"
import { createLocalMediaStorage, mediaKey } from "@/lib/media/storage"
import { sniffImage } from "@/lib/media/sniff"
import { createOrganization } from "@/lib/org/store"
import { createMigratedDatabase } from "./helpers/database"

const clients: Array<{ close: () => Promise<void> }> = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function database() {
  const client = await createMigratedDatabase()
  clients.push(client)
  return client
}

async function storage() {
  const dir = await mkdtemp(path.join(tmpdir(), "cognera-media-"))
  directories.push(dir)
  return createLocalMediaStorage(dir)
}

async function organization(
  client: Awaited<ReturnType<typeof database>>,
  slug: string,
  ownerId: string,
) {
  const organizationId = await createOrganization(client, { name: slug, slug, userId: ownerId })
  await client.transaction(async (tx) => {
    await tx.query("select set_config('app.member_sync', '1', true)")
    await tx.query(
      "insert into organization_members (organization_id, user_id, role) values ($1::uuid, $2, 'editor'), ($1::uuid, $3, 'member')",
      [organizationId, `${slug}-editor`, `${slug}-member`],
    )
  })
  return organizationId
}

const png = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
)

describe("content documents", () => {
  test("drops scriptable links and rejects unknown markup", () => {
    const cleaned = sanitizeDocument(
      parseDocument({
        version: 1,
        blocks: [
          {
            type: "paragraph",
            spans: [
              { text: "Read", href: "javascript:alert(1)", bold: true },
              { text: "Stay", href: "/about" },
            ],
          },
        ],
      }),
    )
    expect(cleaned.blocks[0]).toMatchObject({
      type: "paragraph",
      spans: [
        { text: "Read", bold: true },
        { text: "Stay", href: "/about" },
      ],
    })
    expect(() =>
      parseDocument({ version: 1, blocks: [{ type: "html", html: "<script>" }] }),
    ).toThrow()
  })
})

describe("cms publishing", () => {
  test("keeps drafts private, publishes saved fields, and restores revisions", async () => {
    const client = await database()
    const organizationId = await organization(client, "alpha", "owner-1")
    const otherId = await organization(client, "beta", "owner-2")
    const owner = { organizationId, userId: "owner-1", role: "owner" }
    const editor = { organizationId, userId: "alpha-editor", role: "editor" }
    const member = { organizationId, userId: "alpha-member", role: "member" }
    const document = emptyDocument()
    document.blocks[0] = { type: "paragraph", spans: [{ text: "Saved body" }] }

    await expect(
      createContent(client, member, "page", {
        title: "No",
        slug: "no",
        excerpt: null,
        document,
        seoTitle: null,
        metaDescription: null,
        canonicalUrl: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" })

    const page = await createContent(client, editor, "page", {
      title: "Hello",
      slug: "hello",
      excerpt: "A short excerpt",
      document,
      seoTitle: "Hello SEO",
      metaDescription: "Hello description",
      canonicalUrl: "https://example.com/hello",
    })
    expect(page.status).toBe("draft")
    expect(page.seoTitle).toBe("Hello SEO")

    await expect(
      createContent(client, editor, "page", {
        title: "Again",
        slug: "hello",
        excerpt: null,
        document,
        seoTitle: null,
        metaDescription: null,
        canonicalUrl: null,
      }),
    ).rejects.toMatchObject({ code: "slug_conflict", status: 409 })

    await expect(
      updateContent(client, editor, "page", page.id, { status: "published" }),
    ).rejects.toMatchObject({ code: "forbidden" })

    const published = await updateContent(client, owner, "page", page.id, {
      title: "Hello again",
      status: "published",
    })
    expect(published.status).toBe("published")
    expect(published.title).toBe("Hello again")
    expect(published.publishedAt).toBeTruthy()

    const visible = await queryPublicPage(client, organizationId, "hello")
    expect(visible?.title).toBe("Hello again")
    expect(visible?.document.blocks[0]).toMatchObject({ spans: [{ text: "Saved body" }] })
    expect(visible?.seoTitle).toBe("Hello SEO")
    expect(visible?.canonicalUrl).toBe("https://example.com/hello")

    await client.transaction(async (tx) => {
      await tx.query("set local role cognera_app")
      expect(await queryPublicPage(tx, organizationId, "missing")).toBeNull()
      const raw = await tx.query("select id from cms_pages")
      expect(raw.rows).toHaveLength(0)
      const publishedRow = await queryPublicPage(tx, organizationId, "hello")
      expect(publishedRow?.id).toBe(page.id)
    })

    await expect(
      getContent(client, { organizationId: otherId, userId: "owner-2", role: "owner" }, "page", page.id),
    ).rejects.toMatchObject({
      code: "not_found",
    })

    const scheduled = await updateContent(client, owner, "page", page.id, {
      status: "scheduled",
      publishAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    expect(scheduled.status).toBe("scheduled")
    expect(await queryPublicPage(client, organizationId, "hello")).toBeNull()

    await updateContent(client, owner, "page", page.id, {
      status: "scheduled",
      publishAt: new Date(Date.now() - 60 * 1000).toISOString(),
    })
    expect((await queryPublicPage(client, organizationId, "hello"))?.id).toBe(page.id)

    const unpublished = await updateContent(client, owner, "page", page.id, { status: "draft" })
    expect(unpublished.status).toBe("draft")
    expect(await queryPublicPage(client, organizationId, "hello")).toBeNull()

    const revisions = await listRevisions(client, owner, "page", page.id)
    const original = revisions.find((revision) => JSON.parse(revision.snapshot).title === "Hello")
    expect(original).toBeTruthy()
    const restored = await restoreRevision(client, owner, "page", page.id, original?.id ?? "")
    expect(restored.title).toBe("Hello")
    expect(restored.status).toBe("draft")
  })
})

describe("media permissions", () => {
  test("stores sniffed images and hides them until published content uses them", async () => {
    const client = await database()
    const files = await storage()
    const organizationId = await organization(client, "media", "owner-1")
    const otherId = await organization(client, "other", "owner-2")
    const owner = { organizationId, userId: "owner-1", role: "owner" }
    expect(() => sniffImage(Buffer.from("<html></html>"))).toThrow()
    expect(() => mediaKey("../etc", crypto.randomUUID())).toThrow()
    await expect(files.put(`../${crypto.randomUUID()}`, png)).rejects.toThrow()

    const asset = await uploadMedia(
      client,
      owner,
      { filename: "../../note.png", bytes: png },
      files,
    )
    expect(asset.filename).toBe("note.png")
    const memberFile = await readMemberMedia(client, owner, asset.id, files)
    expect(memberFile?.bytes.equals(png)).toBe(true)
    expect(
      await readMemberMedia(
        client,
        { organizationId: otherId, userId: "owner-2", role: "owner" },
        asset.id,
        files,
      ),
    ).toBeNull()
    expect(await queryPublicMediaVisible(client, organizationId, asset.id)).toBe(false)
    expect(await readPublicMediaFile(client, organizationId, asset.id, files)).toBeNull()

    const page = await createContent(client, owner, "page", {
      title: "With image",
      slug: "with-image",
      excerpt: null,
      document: {
        version: 1,
        blocks: [{ type: "image", mediaId: asset.id, alt: "A pixel" }],
      },
      featuredMediaId: asset.id,
      seoTitle: null,
      metaDescription: null,
      canonicalUrl: null,
    })
    await updateContent(client, owner, "page", page.id, { status: "published" })
    expect(await queryPublicMediaVisible(client, organizationId, asset.id)).toBe(true)
    const publicFile = await readPublicMediaFile(client, organizationId, asset.id, files)
    expect(publicFile?.contentType).toBe("image/png")

    await client.transaction(async (tx) => {
      await tx.query("set local role cognera_app")
      const hidden = await tx.query("select id from media_assets")
      expect(hidden.rows).toHaveLength(0)
      const opened = await readPublicMediaFile(tx, organizationId, asset.id, files)
      expect(opened?.bytes.equals(png)).toBe(true)
    })
  })
})
