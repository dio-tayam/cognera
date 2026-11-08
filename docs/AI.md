# Local AI (Ollama)

Cognera uses [Ollama](https://ollama.com) as its default and only AI provider. No paid inference API or API key is required. If Ollama is missing or offline, AI screens show the real connection error and every other part of Cognera keeps working. Cognera never switches to another provider.

## Install Ollama

| Platform | Install                                                                                                  | Start                                              |
| -------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| macOS    | Download from https://ollama.com/download/mac, or `brew install ollama`                                  | Open the Ollama app, or `brew services start ollama` |
| Windows  | Download `OllamaSetup.exe` from https://ollama.com/download/windows, or `winget install Ollama.Ollama`    | Starts in the system tray after install            |
| Linux    | `curl -fsSL https://ollama.com/install.sh \| sh` (read the script first if you prefer)                   | `sudo systemctl enable --now ollama`, or `ollama serve` |

Docker users can run the bundled server with `docker compose --profile ai up -d`, then pull a model inside it: `docker compose exec ollama ollama pull llama3.2`.

## Configure

Add to `.env.local`:

```
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
# optional, 5000–300000
AI_TIMEOUT_MS=90000
```

Then run:

```
npm run ai:check
```

It detects the `ollama` binary, checks the server, lists installed models, and suggests a model for your RAM. It does **not** download anything. `npm run ai:check -- --pull` asks for a `y` before running `ollama pull`.

## Choosing a model

| RAM (or VRAM)   | Suggested model | Download |
| --------------- | --------------- | -------- |
| under 6 GB      | `llama3.2:1b`   | ~1.3 GB  |
| 8–12 GB         | `llama3.2`      | ~2.0 GB  |
| 16 GB           | `llama3.1:8b`   | ~4.9 GB  |
| 32 GB and up    | `qwen2.5:14b`   | ~9.0 GB  |

Apple silicon shares memory between CPU and GPU, so total RAM is the guide. CPU-only machines should stay at 3B or smaller, and may need a larger `AI_TIMEOUT_MS`. Download a model yourself with `ollama pull <model>`.

## Capabilities

The AI workspace (`/dashboard/ai`) runs a fixed set of operations, defined in `lib/ai/catalog.ts`:

- Draft email (subject and body as JSON, validated)
- Lead inquiry summary
- Lead classification (hot, warm, cold, support, spam; label checked against the allowlist)
- Blog outline (validated JSON)
- Article draft (Markdown)
- FAQ draft (validated JSON, grounded in source text)
- Text transformation (rewrite, shorten, expand, formal, friendly, bullets, fix grammar)

The same transformation modes power the **AI text transformation** workflow node. Every output is editable text. Nothing is sent, published, or changed because the model suggested it.

## API

| Route                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `GET /api/ai/health` | Provider status, installed models, model suggestion          |
| `POST /api/ai/run`   | `{ operation, input }` → editable result. Aborts when the client disconnects. |
| `GET /api/ai/usage`  | Recent runs and 30-day totals for the current organization   |

## Provider interface

`lib/ai/types.ts` defines `AiProvider` with `generateText`, `summarizeText`, `classifyText`, and `checkHealth`. `lib/ai/ollama.ts` implements it with:

- Input limit of 12,000 characters, output limit of 12,000 characters and 1,536 tokens
- Timeouts (`AI_TIMEOUT_MS`), caller cancellation through `AbortSignal`
- Redirects refused; URL credentials rejected
- Typed errors (`not_configured`, `unavailable`, `timeout`, `cancelled`, `model_missing`, `invalid_output`, …) with an operator hint
- At most two concurrent generations per organization

## Usage tracking

`ai_usage_events` (migration `0009_ai_usage.sql`) stores operation, model, outcome, character counts, token counts, and duration per organization, protected by row-level security. Prompts and outputs are **not** stored. Without a database (local preview) usage is kept in memory.

## Security model

All user input, documents, CRM records, webhook payloads, and retrieved content are untrusted.

- **Separation.** Trusted instructions go in the system message. Untrusted data is wrapped in blocks marked with a random per-request boundary, which is stripped from the data so it cannot close its own block.
- **Detection.** Common injection phrasing is flagged and shown to the reviewer. Detection is heuristic and is not relied on for safety.
- **Redaction.** Private keys, JWTs, API keys, connection strings, passwords, and card numbers (Luhn-checked) are removed before text reaches the model and again from its output.
- **Output hygiene.** HTML tags, script-like URLs, and control characters are stripped; the interface renders output as text only.
- **Structured outputs** are parsed with Zod; labels must come from the allowlist.
- **No capabilities.** The model has no database credentials, shell, HTTP access, or code execution.
- **Actions.** `lib/ai/actions.ts` holds the fixed allowlist of application actions an AI feature may ever request. Each request is schema-validated, the caller's role is re-read on the server immediately before execution, and consequential actions (publish, send) are refused unless an authorized, explicitly configured workflow permits them.

Prompt-injection defenses reduce risk; they are not perfect. Authorization is enforced by deterministic server code independently of anything the model says.
