import { afterEach, describe, expect, test, vi } from "vitest"
import {
  assertResolvedAddresses,
  guardedLookup,
  isBlockedAddress,
  parseOutboundUrl,
  safeOutboundFetch,
  UnsafeUrlError,
} from "@/lib/workflows/ssrf"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("outbound URL checks", () => {
  test("blocks private, metadata, and disguised addresses", async () => {
    const blocked = [
      "http://127.0.0.1/latest",
      "http://127.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://100.64.0.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://0x7f.0.0.1/",
      "http://0177.0.0.1/",
      "http://017700000001/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[::ffff:a9fe:a9fe]/",
      "http://[0:0:0:0:0:ffff:169.254.169.254]/",
      "http://[64:ff9b::a9fe:a9fe]/",
      "http://[2002:7f00:1::]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://localhost/",
      "http://LOCALHOST./",
      "http://service.internal/",
      "http://printer.local/",
      "https://metadata.google.internal/",
      "https://user:pass@example.com/",
      "http://example.com\\@evil.com/",
      "http://example.com@127.0.0.1/",
      "http://example.com:22/",
      "file:///etc/passwd",
      "gopher://example.com/",
    ]
    for (const target of blocked) {
      expect(() => parseOutboundUrl(target), target).toThrow(UnsafeUrlError)
    }
    expect(parseOutboundUrl("https://api.example.com/send").hostname).toBe("api.example.com")
    expect(() => parseOutboundUrl("http://api.example.com/", { requireHttps: true })).toThrow(
      UnsafeUrlError,
    )
  })

  test("classifies addresses numerically", () => {
    for (const address of [
      "0.0.0.0",
      "255.255.255.255",
      "224.0.0.1",
      "::",
      "::ffff:10.0.0.1",
      "::127.0.0.1",
      "2001:db8::1",
      "2001::1",
      "ff02::1",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(address), address).toBe(false)
    }
  })

  test("rejects a host when any resolved address is private", async () => {
    await expect(
      assertResolvedAddresses("example.com", async () => [{ address: "10.1.1.1", family: 4 }]),
    ).rejects.toThrow(UnsafeUrlError)
    await expect(
      assertResolvedAddresses("example.com", async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "::ffff:7f00:1", family: 6 },
      ]),
    ).rejects.toThrow(UnsafeUrlError)
    await expect(
      assertResolvedAddresses("example.com", async () => [{ address: "8.8.8.8", family: 4 }]),
    ).resolves.toEqual([{ address: "8.8.8.8", family: 4 }])
  })

  test("re-resolves at connect time, so DNS rebinding cannot reach a private address", async () => {
    let calls = 0
    const rebinding = async () => {
      calls += 1
      return [{ address: calls === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }]
    }
    await expect(assertResolvedAddresses("rebind.example.com", rebinding)).resolves.toHaveLength(1)
    const result = await new Promise<{ error: Error | null }>((resolve) => {
      guardedLookup(rebinding)("rebind.example.com", { all: true }, (error) => resolve({ error }))
    })
    expect(result.error).toBeInstanceOf(UnsafeUrlError)
  })

  test("the fetch helper refuses before connecting and honors the allowlist", async () => {
    await expect(
      safeOutboundFetch("https://internal.example.com/", { method: "GET" }, async () => [
        { address: "192.168.0.10", family: 4 },
      ]),
    ).rejects.toThrow(UnsafeUrlError)
    vi.stubEnv("OUTBOUND_ALLOWED_HOSTS", "mail.example.com")
    expect(() => parseOutboundUrl("https://other.example.com/")).toThrow(/allowlist/)
    expect(parseOutboundUrl("https://api.mail.example.com/").hostname).toBe("api.mail.example.com")
  })
})
