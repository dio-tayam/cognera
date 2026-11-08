import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { platform } from "node:os"

type Tool = {
  name: string
  command: string
  args: string[]
  required: boolean
}

const tools: Tool[] = [
  { name: "Node.js", command: "node", args: ["-v"], required: true },
  { name: "npm", command: "npm", args: ["-v"], required: true },
  { name: "Git", command: "git", args: ["--version"], required: true },
  { name: "Docker", command: "docker", args: ["--version"], required: false },
  { name: "Docker Compose", command: "docker", args: ["compose", "version"], required: false },
]

function versionOf(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  } catch {
    return null
  }
}

function nodeIsSupported(versionText: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(versionText)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return major === 24 && minor >= 18
}

function installInstructions(missing: string[]): string[] {
  const os = platform()
  const lines: string[] = []
  const wantsNode = missing.some((name) => name === "Node.js" || name === "npm")
  const wantsGit = missing.includes("Git")
  const wantsDocker = missing.includes("Docker") || missing.includes("Docker Compose")

  if (os === "darwin") {
    if (wantsNode) {
      lines.push("macOS Node.js 24 LTS: brew install node@24")
      lines.push(
        "If Homebrew's node formula is not on your PATH, follow the caveats printed by brew.",
      )
    }
    if (wantsGit) lines.push("macOS Git: xcode-select --install")
    if (wantsDocker) {
      lines.push("macOS Docker: brew install --cask docker")
      lines.push("Then start Docker Desktop with: open -a Docker")
    }
  } else if (os === "win32") {
    if (wantsNode) lines.push("Windows Node.js 24 LTS: winget install OpenJS.NodeJS.LTS")
    if (wantsGit) lines.push("Windows Git: winget install Git.Git")
    if (wantsDocker) lines.push("Windows Docker: winget install Docker.DockerDesktop")
  } else {
    if (wantsNode) {
      lines.push("Linux Node.js 24.21.0 with fnm:")
      lines.push("  curl -fsSL https://fnm.vercel.app/install | bash")
      lines.push("  fnm install 24.21.0 && fnm use 24.21.0")
    }
    if (wantsGit)
      lines.push("Debian/Ubuntu Git: sudo apt-get update && sudo apt-get install -y git")
    if (wantsDocker) {
      lines.push("Linux Docker Engine: https://docs.docker.com/engine/install/")
      lines.push("After installation, start it with: sudo systemctl start docker")
    }
  }

  if (lines.length === 0) {
    lines.push("No missing required tools.")
  }
  return lines
}

const pinned = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim()
let failed = false
const missing: string[] = []

console.log(`Pinned Node.js LTS patch: ${pinned}`)
console.log("Supported range: >=24.18.0 <25")

for (const tool of tools) {
  const version = versionOf(tool.command, tool.args)
  if (!version) {
    missing.push(tool.name)
    if (tool.required) {
      failed = true
      console.error(`failed: ${tool.name} is not installed.`)
    } else {
      console.log(`blocked: ${tool.name} is not installed. Container workflows stay unavailable.`)
    }
    continue
  }
  console.log(`pass: ${tool.name} ${version}`)
  if (tool.name === "Node.js" && !nodeIsSupported(version)) {
    failed = true
    console.error(`failed: Node.js ${version} is outside >=24.18.0 <25.`)
  }
}

const dockerVersion = versionOf("docker", ["--version"])
if (dockerVersion) {
  const daemon = versionOf("docker", ["info", "--format", "{{.ServerVersion}}"])
  if (!daemon) {
    console.log("blocked: Docker is installed, but the daemon is not running.")
    if (platform() === "darwin") console.log("Start it with: open -a Docker")
    else if (platform() === "win32") console.log("Start Docker Desktop from the Start menu.")
    else console.log("Start it with: sudo systemctl start docker")
  } else {
    console.log(`pass: Docker daemon ${daemon}`)
  }
}

const ollama = versionOf("ollama", ["--version"])
if (!ollama) {
  console.log(
    "blocked: Ollama is not installed. Local AI inference stays disabled until OLLAMA_BASE_URL points at a running server.",
  )
} else {
  console.log(`pass: Ollama ${ollama}`)
}

if (missing.length > 0) {
  console.log("Install the missing tools with:")
  for (const line of installInstructions(missing)) console.log(line)
}

if (failed) process.exit(1)
console.log("pass: required tools are available.")
