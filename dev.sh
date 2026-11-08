#!/usr/bin/env bash
# One-command local dev: Ollama, a public tunnel for the workflow email relay
# (EMAIL_WEBHOOK_URL must be a public HTTPS URL, see lib/workflows/ssrf.ts), and
# `next dev`. Run ./dev.sh from the repo root.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE=".env"
TUNNEL_LOG="$(mktemp -t cognera-tunnel.XXXXXX)"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT INT TERM

# --- Ollama -----------------------------------------------------------------
if command -v ollama >/dev/null 2>&1; then
  if ! curl -s -o /dev/null "http://127.0.0.1:11434/api/tags"; then
    echo "Starting Ollama..."
    if command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -q "^ollama"; then
      brew services start ollama >/dev/null
    else
      ollama serve >/tmp/cognera-ollama.log 2>&1 &
      PIDS+=("$!")
    fi
    for _ in $(seq 1 20); do
      curl -s -o /dev/null "http://127.0.0.1:11434/api/tags" && break
      sleep 0.5
    done
  fi
  echo "Ollama is up."
else
  echo "Ollama is not installed; AI features stay off. See https://ollama.com/download" >&2
fi

# --- Public tunnel for EMAIL_WEBHOOK_URL -------------------------------------
if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting Cloudflare quick tunnel..."
  cloudflared tunnel --url http://localhost:3000 >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  PIDS+=("$TUNNEL_PID")

  TUNNEL_URL=""
  for _ in $(seq 1 40); do
    TUNNEL_URL="$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
    [ -n "$TUNNEL_URL" ] && break
    sleep 0.5
  done

  if [ -n "$TUNNEL_URL" ]; then
    RELAY_URL="${TUNNEL_URL}/api/email-relay"
    if grep -q '^EMAIL_WEBHOOK_URL=' "$ENV_FILE" 2>/dev/null; then
      sed -i.bak "s|^EMAIL_WEBHOOK_URL=.*|EMAIL_WEBHOOK_URL=${RELAY_URL}|" "$ENV_FILE"
      rm -f "${ENV_FILE}.bak"
    else
      printf '\nEMAIL_WEBHOOK_URL=%s\n' "$RELAY_URL" >>"$ENV_FILE"
    fi
    echo "Tunnel ready: $TUNNEL_URL"
    echo "EMAIL_WEBHOOK_URL updated in $ENV_FILE"
  else
    echo "Tunnel did not come up in time; EMAIL_WEBHOOK_URL was left unchanged." >&2
  fi
else
  echo "cloudflared is not installed; EMAIL_WEBHOOK_URL stays whatever is in $ENV_FILE. See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
fi

# --- Workflow worker (polls jobs queued by Test run / Run now / triggers) ---
echo "Starting workflow worker..."
npm run workflows:work -- --loop >/tmp/cognera-worker.log 2>&1 &
PIDS+=("$!")

# --- Next.js dev server (foreground) -----------------------------------------
echo "Starting next dev..."
npm run dev
