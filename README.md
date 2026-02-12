# Website Walker — Autonomous Site QA Agent

An autonomous QA agent that uses the Gemini CLI + Playwright to walk websites, capture screenshots, generate GIFs and produce human-readable HTML assessment reports. The bridge service exposes a simple HTTP endpoint that orchestrates Gemini runs (used by n8n in the provided workflow).

- Bridge server: Node.js (bridge.js) — listens on port 3333 for internal requests.
- Reports & recordings: static files under public/walk-reports and public/recordings served by Caddy on port 8443.
- Orchestration: n8n (Docker) — example workflow included (n8n-workflow.json).
- GIF generation: ffmpeg (background job invoked by the bridge).

---

## Table of contents
- [Quick architecture overview](#quick-architecture-overview)
- [Prerequisites](#prerequisites)
- [Configuration (.env)](#configuration-env)
- [Quickstart (development / host)](#quickstart-development--host)
- [Docker / Production quickstart](#docker--production-quickstart)
- [Calling the Bridge API (/run-qa)](#calling-the-bridge-api-run-qa)
- [n8n workflow](#n8n-workflow)
- [File layout and outputs](#file-layout-and-outputs)
- [GIF generation & system requirements](#gif-generation--system-requirements)
- [Logs, troubleshooting & tips](#logs-troubleshooting--tips)
- [Security recommendations](#security-recommendations)
- [Maintenance & backup](#maintenance--backup)
- [License & contributing](#license--contributing)

---

## Quick architecture overview
- n8n (in Docker) schedules tasks and sends prompts to the Bridge service via HTTP.
- Bridge (bridge.js) constructs a strict Gemini CLI prompt instructing the Playwright MCP agent to perform actions and save screenshots.
- Bridge triggers background GIF generation (ffmpeg) from saved screenshots.
- Gemini/Playwright produces an HTML report saved to `public/walk-reports/` and screenshots in `public/recordings/`.
- Caddy serves static reports and proxies n8n on the public URL/port.

---

## Prerequisites
- Node.js (>=14 recommended)
- npm
- Docker & docker-compose (for n8n + Caddy)
- Gemini CLI installed and accessible (or provide path via GEMINI_PATH)
- Playwright MCP server and Playwright dependencies (the Gemini agent relies on Playwright MCP)
- ffmpeg (for creating GIFs)
- An absolute path to the project folder for WORK_DIR (used by the bridge)

---

## Configuration (.env)
Copy the example and edit the variables:

```bash
cp .env.example .env
```

Important variables (set these in `.env`):

- BRIDGE_API_KEY — required. Secret API key that n8n (and any local caller) must send in `x-api-key` header.
- GEMINI_PATH — path to Gemini CLI executable (e.g., `/usr/bin/gemini` or `gemini` if in PATH).
- WORK_DIR — absolute path to this project directory (bridge uses it to locate `public/`).
- PUBLIC_BASE_URL — public base URL for reports (eg: `https://example.com:8443`).
- N8N_BASIC_AUTH_USER / N8N_BASIC_AUTH_PASSWORD — used in docker-compose for n8n basic auth.
- NOTION_TASKS_URL / NOTION_RESULTS_URL — Notion integration used by the provided n8n workflow (optional).

Note: The bridge will exit if BRIDGE_API_KEY is not set.

---

## Quickstart (development / host)
1. Clone:
   ```bash
   git clone https://github.com/Yar1991/website_walker.git
   cd website_walker
   ```

2. Install Node dependencies:
   ```bash
   npm install
   ```

3. Edit `.env` (see previous section); ensure `WORK_DIR` is an absolute path and `GEMINI_PATH` points to your Gemini binary.

4. Start Docker services (n8n & Caddy) — run from repository root:
   ```bash
   docker compose up -d
   ```
   - Caddy serves `public/` folders on port 8443 and reverse-proxies n8n to the root path.

5. Start the bridge service on the host (so it can access the Gemini CLI / system tools):
   - Using helper script:
     ```bash
     ./start
     ```
   - Or directly:
     ```bash
     npm start
     ```
   The bridge listens on port 3333. Check `bridge.log` for runtime messages.

Notes:
- The bridge enforces that incoming requests originate from localhost (`127.0.0.1`, `::1`) or Docker-internal networks (172.* / ::ffff:172.*).
- Ensure the host can run `gemini` and Playwright MCP is reachable by Gemini.

---

## Docker / Production quickstart
1. Set environment variables (use `.env` file referenced by docker-compose).
2. Start stack:
   ```bash
   docker compose up -d
   ```
3. Start the bridge on the host (not inside Docker):
   ```bash
   ./start
   ```

Caddy runs in Docker and exposes port 8443 for both n8n UI and static reports/recordings.

---

## Calling the Bridge API (/run-qa)
Endpoint:
- URL: http://localhost:3333/run-qa
- Method: POST
- Header: x-api-key: <BRIDGE_API_KEY>
- Body: JSON with key `chatInput` (the user instructions / prompt)

Example:
```bash
curl -X POST "http://localhost:3333/run-qa" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${BRIDGE_API_KEY}" \
  -d '{"chatInput":"Open example.com, search for \"documentation\", and tell me if results are easy to read."}'
```

Example response (JSON):
```json
{
  "stdout": ".... trimmed CLI output ....",
  "reportUrl": "https://example.com:8443/walk-reports/report_run_1612345678901.html",
  "sessionId": "run_1612345678901",
  "error": null
}
```

- If the Gemini CLI prints the generated report URL, the bridge will try to extract and return it in `reportUrl`. If it cannot find the URL in CLI output it will return `"No report URL found."`.
- Bridge triggers GIF generation in the background (does not wait for ffmpeg completion).

IP restriction: only requests from localhost or Docker internal host are allowed. If calling from another machine, use an SSH tunnel or call via dockerized n8n (host.docker.internal).

---

## n8n workflow
- `n8n-workflow.json` contains an example workflow ("Website Walker") that:
  - Reads tasks from Notion (NOTION_TASKS_URL),
  - Sends the task text to the Bridge via HTTP request (using BRIDGE_API_KEY),
  - Posts resulting report links back to Notion and Slack.
- Import into n8n:
  1. Go to n8n UI.
  2. Import workflow JSON.
  3. Ensure environment variables (BRIDGE_API_KEY, INTERNAL_AGENT_URL, SLACK_WEBHOOK, NOTION_* URLs) are set in n8n instance.
- The workflow uses `host.docker.internal` to reach the host bridge API; ensure Docker's `extra_hosts` or `host-gateway` mapping works on your platform.

---

## File layout and outputs
- bridge.js — main Node bridge server.
- start — small helper script to run the bridge in background.
- public/recordings/ — screenshots and generated GIFs (ignored by git).
- public/walk-reports/ — generated HTML reports (ignored by git).
- bridge.log — bridge logs (ignored by git).
- n8n-workflow.json — example n8n workflow for scheduling and executing tasks.
- backup_n8n.sh — simple helper script to export n8n workflows to backup file.

Important: `public/recordings/` and `public/walk-reports/` are mounted into Caddy container so Caddy can serve them.

---

## GIF generation & system requirements
- GIFs are generated in the background by the bridge using `ffmpeg`. The bridge runs:
  ffmpeg -pattern_type glob -i '..._step_*.png' -vf "scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 'session.gif'
- Install `ffmpeg` on the host so background GIF creation succeeds.
- If ffmpeg is not present, GIF generation will log an error but the main report creation is unaffected.

---

## Logs, troubleshooting & tips
- Bridge log file: `bridge.log` in repository root.
- Common checks:
  - `BRIDGE_API_KEY` present in `.env`.
  - Gemini CLI available: `which gemini` or set `GEMINI_PATH` in `.env`.
  - Playwright MCP: ensure the Gemini agent's Playwright calls work (this depends on your Gemini configuration).
  - ffmpeg installed for GIF creation.
  - Permissions: bridge must be able to write to `public/recordings` and `public/walk-reports`.
- If the bridge exits immediately, check `BRIDGE_API_KEY` (it will fatal-exit if not set).
- If reports are not visible at the public URL, ensure Caddy is running and serving `public/walk-reports/` and that `PUBLIC_BASE_URL` matches the Caddy host configuration.

---

## Security recommendations
- Keep `BRIDGE_API_KEY` secret and only use it for internal communication (n8n → bridge).
- Limit access to Caddy (use HTTPS and proper auth for `/walk-reports` and `/recordings`).
  - The included Caddyfile shows a place to set `basic_auth` with hashed passwords — replace placeholders with proper credentials.
- Do not expose the bridge API to public networks. It's intended for internal use (localhost <-> Docker).
- Rotate API keys regularly and use secure storage for credentials (e.g., Docker secrets, Vault).

---

## Maintenance & backup
- Backup n8n workflows with the provided script:
  ```bash
  # Edit backup_n8n.sh to set PROJECT_DIR, then:
  ./backup_n8n.sh
  ```
- Keep Playwright and Gemini updated. If Playwright changes recording APIs, the prompt/tooling may need adjustment.
- Periodically prune old `public/recordings` and `public/walk-reports` to save disk space.

---

## Troubleshooting quick list
- No response from bridge:
  - Is bridge running? `ps aux | grep bridge.js`
  - Check `bridge.log`.
- `Unauthorized` response:
  - Ensure request includes `x-api-key` header with the BRIDGE_API_KEY.
- No report URL returned:
  - Check Gemini CLI output in `bridge.log` or stdout captured by bridge; Gemini may not have printed the report URL.
- GIF not generated:
  - Ensure `ffmpeg` is installed and `public/recordings/` contains `*_step_*.png`.
