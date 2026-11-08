import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { Agent, fetch as undiciFetch } from "undici"
import { workflowLimits } from "@/lib/workflows/limits"

/**
 * Outbound HTTP for workflow actions.
 *
 * - Only http(s) URLs without credentials. Production destinations should be HTTPS.
 * - Host names are resolved, and every address must be public. The socket connects
 *   to the address that was checked (the lookup runs inside the connection), so a
 *   DNS answer that changes between check and connect cannot reach a private host.
 * - IP literals are parsed numerically, so octal, hex, integer, IPv4-mapped,
 *   IPv4-compatible, NAT64, 6to4, and Teredo forms are all checked as the IPv4 they carry.
 * - Redirects are re-validated hop by hop, and are not followed for requests with a body.
 * - Connect, header, body, and total timeouts apply, and response bodies are capped.
 * - OUTBOUND_ALLOWED_HOSTS, when set, is a comma-separated allowlist of host names.
 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeUrlError"
  }
}

type Address = { address: string; family: number }
type Resolver = (hostname: string) => Promise<Address[]>

const blockedNames = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
])

const blockedSuffixes = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet"]

function allowedHosts(): string[] | null {
  const raw = process.env.OUTBOUND_ALLOWED_HOSTS?.trim()
  if (!raw) return null
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean)
}

export function assertSafeHostname(hostname: string): void {
  let host = hostname.trim().toLowerCase().replace(/\.$/, "")
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1)
  if (!host || /[\\%@\s/?#]/.test(host)) {
    throw new UnsafeUrlError("The destination host is not allowed.")
  }
  if (blockedNames.has(host) || blockedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new UnsafeUrlError("The destination host is not allowed.")
  }
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new UnsafeUrlError("The destination address is not allowed.")
    return
  }
  // WHATWG URL parsing already turns 0x7f.1, 017700000001, and 2130706433 into
  // dotted IPv4. Anything that still looks numeric was not normalized; reject it.
  if (
    /^[0-9.]+$/.test(host) ||
    /^0x/i.test(host) ||
    host.split(".").some((part) => /^0x/i.test(part))
  ) {
    throw new UnsafeUrlError("The destination address is not allowed.")
  }
  if (
    !/^[a-z0-9.-]+$/.test(host) ||
    !host.includes(".") ||
    host.startsWith(".") ||
    host.includes("..") ||
    host
      .split(".")
      .some(
        (label) =>
          label.length === 0 || label.length > 63 || label.startsWith("-") || label.endsWith("-"),
      )
  ) {
    throw new UnsafeUrlError("The destination host is not allowed.")
  }
  const allow = allowedHosts()
  if (allow && !allow.some((entry) => host === entry || host.endsWith(`.${entry}`))) {
    throw new UnsafeUrlError("The destination host is not on the allowlist.")
  }
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isBlockedV4(parseV4(address))
  if (family === 6) {
    const bytes = parseV6(address)
    return bytes ? isBlockedV6(bytes) : true
  }
  return true
}

function parseV4(address: string): number[] | null {
  const parts = address.split(".")
  if (parts.length !== 4) return null
  const bytes = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN))
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null
  return bytes
}

function isBlockedV4(bytes: number[] | null): boolean {
  if (!bytes) return true
  const [a = 0, b = 0, c = 0] = bytes
  if (a === 0) return true // this network
  if (a === 10) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 0 && c === 0) return true // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true // documentation
  if (a === 192 && b === 88 && c === 99) return true // 6to4 relay anycast
  if (a === 192 && b === 168) return true // private
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51 && c === 100) return true // documentation
  if (a === 203 && b === 0 && c === 113) return true // documentation
  if (a >= 224) return true // multicast, reserved, broadcast
  return false
}

/** Parses any IPv6 text form, including an embedded dotted IPv4 tail, to 16 bytes. */
function parseV6(raw: string): number[] | null {
  let address = raw.toLowerCase()
  const zone = address.indexOf("%")
  if (zone !== -1) return null
  let tail: number[] = []
  const lastColon = address.lastIndexOf(":")
  if (address.slice(lastColon + 1).includes(".")) {
    const v4 = parseV4(address.slice(lastColon + 1))
    if (!v4) return null
    tail = v4
    address = `${address.slice(0, lastColon + 1)}0:0`
  }
  const halves = address.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - rest.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest]
  if (groups.length !== 8) return null
  const bytes: number[] = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    const value = Number.parseInt(group, 16)
    bytes.push(value >> 8, value & 0xff)
  }
  if (tail.length === 4) bytes.splice(12, 4, ...tail)
  return bytes
}

function isBlockedV6(bytes: number[]): boolean {
  const zeroPrefix = (count: number) => bytes.slice(0, count).every((byte) => byte === 0)
  const embedded = (offset: number) => bytes.slice(offset, offset + 4)
  if (bytes.every((byte) => byte === 0)) return true // unspecified
  if (zeroPrefix(15) && bytes[15] === 1) return true // loopback
  // IPv4-mapped ::ffff:a.b.c.d and the SIIT form ::ffff:0:a.b.c.d
  if (zeroPrefix(10) && bytes[10] === 0xff && bytes[11] === 0xff) return isBlockedV4(embedded(12))
  if (
    zeroPrefix(8) &&
    bytes[8] === 0xff &&
    bytes[9] === 0xff &&
    bytes[10] === 0 &&
    bytes[11] === 0
  ) {
    return isBlockedV4(embedded(12))
  }
  if (zeroPrefix(12)) return true // deprecated IPv4-compatible ::a.b.c.d
  // NAT64 64:ff9b::/96 and local-use 64:ff9b:1::/48 translate to IPv4.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return true
  if (bytes[0] === 0x01 && bytes[1] === 0x00 && bytes.slice(2, 8).every((byte) => byte === 0)) {
    return true // discard-only 100::/64
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return true // 6to4 can reach any IPv4
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return true // Teredo
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return true // documentation
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && (bytes[2] ?? 0) < 0x02) return true // IETF special
  const first = bytes[0] ?? 0
  const second = bytes[1] ?? 0
  if ((first & 0xfe) === 0xfc) return true // unique local fc00::/7
  if (first === 0xfe && (second & 0xc0) === 0x80) return true // link-local fe80::/10
  if (first === 0xfe && (second & 0xc0) === 0xc0) return true // site-local fec0::/10
  if (first === 0xff) return true // multicast
  // Only global unicast 2000::/3 is reachable.
  return (first & 0xe0) !== 0x20
}

export function parseOutboundUrl(raw: string, options?: { requireHttps?: boolean }): URL {
  if (typeof raw !== "string" || raw.length > 2048 || /[\s\\]/.test(raw)) {
    throw new UnsafeUrlError("The destination URL is not allowed.")
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError("The destination URL is not valid.")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("The destination URL is not allowed.")
  }
  if (options?.requireHttps && url.protocol !== "https:") {
    throw new UnsafeUrlError("The destination must use HTTPS.")
  }
  const authority = raw.slice(raw.indexOf("//") + 2).split(/[/?#]/)[0] ?? ""
  if (url.username || url.password || authority.includes("@")) {
    throw new UnsafeUrlError("The destination URL is not allowed.")
  }
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    throw new UnsafeUrlError("The destination port is not allowed.")
  }
  assertSafeHostname(url.hostname)
  return url
}

export async function assertResolvedAddresses(
  hostname: string,
  resolve: Resolver = resolveAll,
): Promise<Address[]> {
  assertSafeHostname(hostname)
  const bare = hostname.replace(/^\[|\]$/g, "")
  if (isIP(bare)) return [{ address: bare, family: isIP(bare) }]
  let addresses: Address[]
  try {
    addresses = await resolve(bare)
  } catch {
    throw new UnsafeUrlError("The destination host could not be resolved.")
  }
  if (addresses.length === 0 || addresses.some((item) => isBlockedAddress(item.address))) {
    throw new UnsafeUrlError("The destination address is not allowed.")
  }
  return addresses
}

async function resolveAll(hostname: string): Promise<Address[]> {
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records.map((record) => ({ address: record.address, family: record.family }))
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void

/** A connect-time lookup that only ever hands the socket checked addresses. */
export function guardedLookup(resolve: Resolver = resolveAll) {
  return (
    hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: LookupCallback,
  ) => {
    const wantsAll = typeof options === "object" && options !== null && options.all === true
    assertResolvedAddresses(hostname, resolve)
      .then((addresses) => {
        if (wantsAll) callback(null, addresses)
        else callback(null, addresses[0]?.address ?? "", addresses[0]?.family ?? 4)
      })
      .catch((error: unknown) => {
        const failure = (
          error instanceof Error
            ? error
            : new UnsafeUrlError("The destination address is not allowed.")
        ) as NodeJS.ErrnoException
        failure.code = "EUNSAFEHOST"
        callback(failure, wantsAll ? [] : "", 4)
      })
  }
}

export type OutboundResponse = { status: number; text: string; headers: Record<string, string> }

export async function safeOutboundFetch(
  raw: string,
  init: {
    method?: "GET" | "POST"
    headers?: Record<string, string>
    body?: string
    requireHttps?: boolean
    signal?: AbortSignal
    timeoutMs?: number
  },
  resolve?: Resolver,
): Promise<OutboundResponse> {
  const method = init.method ?? "GET"
  let current = parseOutboundUrl(raw, { requireHttps: init.requireHttps })
  const timeout = AbortSignal.timeout(init.timeoutMs ?? workflowLimits.stepTimeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  for (let hop = 0; hop < 4; hop += 1) {
    await assertResolvedAddresses(current.hostname, resolve)
    const agent = new Agent({
      connect: { timeout: 5_000, lookup: guardedLookup(resolve) as never },
      headersTimeout: 8_000,
      bodyTimeout: 8_000,
    })
    try {
      const response = await undiciFetch(current, {
        method,
        headers: init.headers,
        body: init.body,
        redirect: "manual",
        signal,
        dispatcher: agent,
      })
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel()
        const location = response.headers.get("location")
        if (!location) throw new UnsafeUrlError("The destination redirected without a location.")
        if (method !== "GET") {
          throw new UnsafeUrlError("The destination redirected a request that has a body.")
        }
        current = parseOutboundUrl(new URL(location, current).toString(), {
          requireHttps: init.requireHttps,
        })
        continue
      }
      const text = await readCapped(response.body, workflowLimits.outboundResponseBytes)
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })
      return { status: response.status, text, headers }
    } finally {
      await agent.close().catch(() => undefined)
    }
  }
  throw new UnsafeUrlError("The destination redirected too many times.")
}

type ByteStream = {
  getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> }
}

async function readCapped(body: ByteStream | null | undefined, limit: number): Promise<string> {
  if (!body) return ""
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      break
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks)).slice(0, limit)
}
