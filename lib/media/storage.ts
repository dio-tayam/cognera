import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export type MediaStorage = {
  put(key: string, bytes: Buffer): Promise<void>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
}

export function mediaKey(organizationId: string, assetId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^[0-9a-f-]{36}$/i.test(assetId)) {
    throw new Error("The media key is not valid.")
  }
  return `${organizationId}/${assetId}`
}

export function createLocalMediaStorage(
  root = path.join(process.cwd(), "storage", "media"),
): MediaStorage {
  function resolve(key: string): string {
    if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
      throw new Error("The media key is not valid.")
    }
    const full = path.resolve(/*turbopackIgnore: true*/ root, key)
    const rootResolved = path.resolve(/*turbopackIgnore: true*/ root)
    if (!full.startsWith(`${rootResolved}${path.sep}`))
      throw new Error("The media key is not valid.")
    return full
  }

  return {
    async put(key, bytes) {
      const full = resolve(key)
      await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true })
      await writeFile(/*turbopackIgnore: true*/ full, bytes)
    },
    async get(key) {
      try {
        return await readFile(/*turbopackIgnore: true*/ resolve(key))
      } catch {
        return null
      }
    },
    async delete(key) {
      await rm(/*turbopackIgnore: true*/ resolve(key), { force: true })
    },
  }
}

/**
 * Local disk is the development store. Set MEDIA_STORAGE=s3 with
 * S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and
 * S3_REGION to use a compatible object store. The key is still an
 * organization id and asset id, never a caller-supplied path.
 */
export function createMediaStorage(): MediaStorage {
  if (process.env.MEDIA_STORAGE === "s3") return createS3MediaStorage()
  const dir = process.env.MEDIA_STORAGE_DIR?.trim()
  return createLocalMediaStorage(dir || undefined)
}

function createS3MediaStorage(): MediaStorage {
  const endpoint = requiredEnv("S3_ENDPOINT")
  const bucket = requiredEnv("S3_BUCKET")
  const accessKey = requiredEnv("S3_ACCESS_KEY_ID")
  const secret = requiredEnv("S3_SECRET_ACCESS_KEY")
  const region = process.env.S3_REGION?.trim() || "us-east-1"
  return {
    async put(key, bytes) {
      await s3Request("PUT", endpoint, bucket, region, accessKey, secret, key, bytes)
    },
    async get(key) {
      const response = await s3Request("GET", endpoint, bucket, region, accessKey, secret, key)
      if (response.status === 404) return null
      if (!response.ok) throw new Error("Object storage could not be read.")
      return Buffer.from(await response.arrayBuffer())
    },
    async delete(key) {
      const response = await s3Request("DELETE", endpoint, bucket, region, accessKey, secret, key)
      if (!response.ok && response.status !== 404)
        throw new Error("Object storage could not delete the file.")
    },
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required when MEDIA_STORAGE=s3.`)
  return value
}

async function s3Request(
  method: "GET" | "PUT" | "DELETE",
  endpoint: string,
  bucket: string,
  region: string,
  accessKey: string,
  secret: string,
  key: string,
  body?: Buffer,
): Promise<Response> {
  const { createHash, createHmac } = await import("node:crypto")
  const url = new URL(`${endpoint.replace(/\/$/, "")}/${bucket}/${key}`)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  const date = amzDate.slice(0, 8)
  const payloadHash = createHash("sha256")
    .update(body ?? Buffer.alloc(0))
    .digest("hex")
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
  const canonical = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join(
    "\n",
  )
  const scope = `${date}/${region}/s3/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash("sha256").update(canonical).digest("hex")}`
  const signingKey = [date, region, "s3", "aws4_request"].reduce<Buffer>(
    (key, part) => createHmac("sha256", key).update(part).digest(),
    Buffer.from(`AWS4${secret}`),
  )
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex")
  return fetch(url, {
    method,
    body: body ? new Uint8Array(body) : undefined,
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(body ? { "content-type": "application/octet-stream" } : {}),
    },
  })
}
