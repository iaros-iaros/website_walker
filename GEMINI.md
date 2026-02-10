# Site Walk QA Agent

This project implements an autonomous QA agent designed to interact with websites based on user instructions, record the session, and generate human-readable assessment reports.

## Project Overview

- **Orchestrator:** n8n (running in Docker, triggered via chat message).
- **Bridge Server:** Node.js service (`bridge.js`) running on the **Host machine**. It exposes the Gemini CLI to n8n via a local HTTP API (Port 3333).
- **AI Agent:** Gemini CLI configured as a QA expert providing Detailed QA & UX Analysis.
- **Automation Tool:** Playwright MCP server with session video (GIF) recording enabled.
- **Report Server:** Caddy (running in Docker) serving reports, recordings, and reverse-proxying n8n.

## Directory Structure

- `public/recordings/`: Stores session screenshots and generated GIFs.
- `public/walk-reports/`: Stores generated HTML reports.
- `bridge.js`: The Node.js server that bridges HTTP requests to the Gemini CLI.
- `start`: Helper script to launch the bridge server in the background.
- `docker-compose.yml`: Configuration for n8n and Caddy services.
- `Caddyfile`: Configuration for the Caddy web server/proxy.
- `site_walk_workflow.json`: n8n workflow export ready for import.

## Network Configuration

The system uses a single entry point (Caddy) on port `8443` to serve both n8n and the static reports.

- **Base URL:** `https://example.com:8443`
- **n8n Interface:** `https://example.com:8443/`
- **Reports:** `https://example.com:8443/walk-reports/`
- **Bridge API (Internal):** `http://host.docker.internal:3333` (Accessed by n8n)

## How to Start

1.  **Configure Environment:**
    - Copy `.env.example` to `.env`:
        ```bash
        cp .env.example .env
        ```
    - Edit `.env` and add your API keys and configuration:
        - `BRIDGE_API_KEY`: Your secret key.
        - `GEMINI_PATH`: Path to your Gemini executable (e.g., `/usr/bin/gemini` or `gemini` if in PATH).
        - `WORK_DIR`: Absolute path to this project directory.
        - `PUBLIC_BASE_URL`: The public URL of your server (e.g., `https://n8n.example.com:8443`).
        - `NOTION_TASKS_URL`: URL to the Notion page where tasks are retrieved from.
        - `NOTION_RESULTS_URL`: URL to the Notion page where report links are added upon completion.

2.  **Start the Docker Stack (n8n & Caddy):**
    ```bash
    docker-compose up -d
    ```

3.  **Start the Bridge Server (Host):**
    This must run on the host machine to access the Gemini CLI.
    ```bash
    ./start
    ```
    Or manually:
    ```bash
    npm start
    ```

4.  **Configure n8n:**
    - Import `site_walk_workflow.json` into your n8n instance.
    - Update the Slack Webhook URL in the workflow to receive notifications.

## Usage Example

Prompt the n8n chat with:
> "Open example.com, search for 'documentation', and tell me if the search results are easy to read."

The flow:
1. n8n sends the prompt to the Bridge Server (`bridge.js`).
2. Bridge Server invokes Gemini CLI with the request.
3. Gemini navigates the site using Playwright, capturing screenshots.
4. Bridge Server generates a GIF from the screenshots.
5. Gemini generates an HTML report in `public/walk-reports/`.
6. n8n sends the report link to Slack.
