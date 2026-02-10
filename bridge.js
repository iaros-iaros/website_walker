const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'bridge.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// --- LOGGING ---
const originalLog = console.log;
const originalError = console.error;

function logToFile(type, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    const entry = `[${timestamp}] [${type}] ${message}\n`;
    
    // 1. Write to the file
    logStream.write(entry); 
    
    // 2. Write to the console (using the ORIGINAL logger)
    // We do this here instead of inside console.log to avoid duplicate output
    if (type === 'ERROR') {
        originalError(entry.trim());
    }   
}

// Override default loggers to simply call our file logger
console.log = function (...args) {
    logToFile('INFO', args);
};

console.error = function (...args) {
    logToFile('ERROR', args);
};

// --- CONFIG ---
const PORT = 3333;
const API_KEY = process.env.BRIDGE_API_KEY;

// Use environment variables or defaults
const WORK_DIR = process.env.WORK_DIR || __dirname;
const RECORDINGS_DIR = path.join(WORK_DIR, 'public/recordings');
const REPORTS_DIR = path.join(WORK_DIR, 'public/walk-reports');
const GEMINI_PATH = process.env.GEMINI_PATH || 'gemini';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8443';

if (!API_KEY) {
    console.error("FATAL: BRIDGE_API_KEY environment variable not set.");
    process.exit(1);
}

// --- ASYNC GIF GENERATOR (High Quality) ---
function generateGifAsync(sessionId) {
    const pattern = path.join(RECORDINGS_DIR, `${sessionId}_step_*.png`);
    const outputFile = path.join(RECORDINGS_DIR, `${sessionId}.gif`);
    
    // Check if files exist first
    exec(`ls ${pattern}`, (error, stdout) => {
        if (error || !stdout.trim()) {
            console.log(`[BACKGROUND] Skipping GIF: No screenshots found for ${sessionId}`);
            return;
        }
        
        console.log(`[BACKGROUND] Starting High-Quality GIF generation for session: ${sessionId}`);
        
        // Command Breakdown:
        // -framerate 1    : Each image lasts 1 second
        // -vf "..."       : The filter graph
        //    scale=...    : Resize to 1280px wide
        //    split[...]   : Split into two streams
        //    palettegen   : Generate custom color palette from stream 1
        //    paletteuse   : Apply that palette to stream 2
        
        const cmd = `ffmpeg -y -framerate 1 -pattern_type glob -i '${pattern}' -vf "scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 '${outputFile}'`;
        
        exec(cmd, (err) => {
            if (err) console.error(`[BACKGROUND] Failed to create GIF: ${err.message}`);
            else console.log(`[BACKGROUND] GIF created successfully: ${outputFile}`);
        });
    });
}

// --- HTML TEMPLATE (Extracted for readability) ---
const REPORT_TEMPLATE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QA Report: {{SESSION_ID}}</title>
    <style>
        body { background-color: #f4f4f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 40px 0; }
        .report-container { width: 80%; max-width: 1200px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        @media (max-width: 768px) { .report-container { width: 95%; padding: 20px; } body { padding: 10px 0; } }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 15px; margin-top: 0; color: #2c3e50; }
        h2 { color: #34495e; margin-top: 30px; }
        .meta { background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; }
        .meta p { margin: 8px 0; }
        .status-pass { color: #27ae60; font-weight: bold; background: #e8f8f5; padding: 2px 8px; border-radius: 4px; }
        .status-fail { color: #c0392b; font-weight: bold; background: #fdedec; padding: 2px 8px; border-radius: 4px; }
        .gif-container { margin: 25px 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        img { max-width: 100%; display: block; width: 100%; height: auto; }
        .observations { background: #fbfbfb; border-left: 4px solid #3498db; padding: 10px 20px; }
        li { margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="report-container">
        <h1>Assessment Report</h1>
        <div class="meta">
            <p><strong>Date:</strong> [Insert Date & Time]</p>
            <p><strong>Target URL:</strong> <a href="[Insert URL]" target="_blank">[Insert URL]</a></p>
            <p><strong>Session ID:</strong> {{SESSION_ID}}</p>
            <p><strong>Result:</strong> <span class="[Use 'status-pass' or 'status-fail']">[PASS or FAIL]</span></p>
        </div>

	<h2>Task</h2>
	<p>{{TASK}}</p>

        <h2>Executive Summary</h2>
        <p>[Insert a 2-3 sentence high-level summary of the test run.]</p>

        <h2>Visual Session</h2>
        <div class="gif-container">
            <img src="../recordings/{{SESSION_ID}}.gif" alt="Session Recording" />
            <p style="text-align: center; font-size: 0.9em; color: #666; padding: 10px;">(Automated Session Recording)</p>
        </div>

        <h2>Detailed Observations</h2>
        <div class="observations">
            <h3>Functionality</h3>
            <ul>
                <li>[Observation 1]</li>
                <li>[...Add more items as needed]</li>
            </ul>
            <h3>UI/UX & Usability</h3>
            <ul>
                <li>[Feedback 1]</li>
                <li>[...Add more items as needed]</li>
            </ul>
        </div>
    </div>
</body>
</html>
`;

// --- PROMPT TEMPLATE (Restored & Updated for Stability) ---
const PROMPT_TEMPLATE = (userRequest, sessionId) => {

const preparedHtml = REPORT_TEMPLATE_HTML.replace(/{{SESSION_ID}}/g, sessionId).replace(/{{TASK}}/g, userRequest);

return `You are a senior QA Agent.

*** STRICT SYSTEM PROTOCOLS ***
1. NO SCRIPTING: Do NOT create or execute .js, .py, or .sh files. Use playwright mcp tool directly.
2. IGNORE SCHEMA ERRORS: If you see "no schema with key" errors, ignore them. The tools work correctly.
3. VISUALS: Video recording is unavailable.
4. NO RETRIES: If a step fails, document the failure and continue. Do NOT restart the session.

Context:
- Base URL: ${PUBLIC_BASE_URL}/walk-reports
- Reports dir: ${REPORTS_DIR}
- Recordings dir: ${RECORDINGS_DIR}
- SESSION ID: ${sessionId}

User Request: "${userRequest}"

Task:
1. Identify the URL and instructions from the request
    - Use the provided SESSION ID (${sessionId}) to prefix ALL files created during this session to prevent overwriting previous runs.
2. Use the 'playwright' mcp tool specified in settings.json to launch a browser.
    - **CRITICAL:** First, navigate to 'about:blank' and use 'browser_evaluate' to run: "localStorage.clear(); sessionStorage.clear();" to ensure a clean state.
    - Navigate to the URL.
    - Perform the user's requested actions.     
    - **CRITICAL:** Immediately after *every* action, save a screenshot (including the initial action when opening target URL)
    - **NAMING & SAVING:** You MUST use 'browser_screenshot' with the 'path' argument set to the **ABSOLUTE PATH** following this exact pattern:
      - Pattern: ${RECORDINGS_DIR}/${sessionId}_step_01.png
      - (Increment the step number for each action)

3. Act as an expert QA analyst. Analyze the session for:
    - **Overall Success:** Did the flow complete without errors?
    - **UI/UX Feedback:** Identify friction points, confusing layout, visual glitches, or slow interactions.
    - **Usability:** Note any steps that felt unintuitive or required extra effort.

4. Generate an HTML report in the reports directory named 'report_${sessionId}.html'.
- **STRICT STRUCTURE:** Use the HTML template provided below.
    - **DYNAMIC CONTENT:** You must generate as many <li> items as necessary.
    *** BEGIN HTML TEMPLATE ***
    ${preparedHtml}
    *** END HTML TEMPLATE ***
5. Return the URL of the generated report (e.g., ${PUBLIC_BASE_URL}/walk-reports/report_${sessionId}.html) as the final output.
6. Close browser session.`
};

// --- SERVER ---
const server = http.createServer((req, res) => {
    // IP Security
    const ip = req.socket.remoteAddress;
    const isLocal = ip === '127.0.0.1' || ip === '::1';
    const isDocker = ip && (ip.startsWith('172.') || ip.startsWith('::ffff:172.'));

    if (!isLocal && !isDocker) {
        req.destroy(); return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.method !== 'POST' || req.url !== '/run-qa') {
        res.writeHead(404); res.end('Not Found'); return;
    }

    if (req.headers['x-api-key'] !== API_KEY) {
        res.writeHead(401); res.end('Unauthorized'); return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const userRequest = data.chatInput;

            if (!userRequest) {
                res.writeHead(400); res.end(JSON.stringify({ error: 'Missing chatInput' })); return;
            }

            // 1. Assign Session ID Server-Side
            const sessionId = `run_${Date.now()}`;
            console.log(`Received Request. Assigned Session ID: ${sessionId}`);

            // 2. Prepare Prompt
            const safePrompt = PROMPT_TEMPLATE(userRequest, sessionId).replace(/'/g, "'\\''");
            const command = `${GEMINI_PATH} --yolo '${safePrompt}'`;

            // 3. Execute Gemini
            exec(command, { cwd: WORK_DIR }, (error, stdout, stderr) => {
                const trimmedStdout = stdout.trim();
                if (trimmedStdout) console.log('STDOUT:', trimmedStdout);
                
                // 4. Trigger GIF Generation in BACKGROUND
                // (This fixes the lag. We don't wait for it.)
                generateGifAsync(sessionId);

                // 5. Send Response Immediately
                res.writeHead(200, { 'Content-Type': 'application/json' });
                
                const escapedBaseUrl = PUBLIC_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const urlRegex = new RegExp(`${escapedBaseUrl}/walk-reports/[a-zA-Z0-9._-]+\\.html`);
                const match = trimmedStdout.match(urlRegex);
                
                res.end(JSON.stringify({ 
                    stdout: trimmedStdout,
                    reportUrl: match ? match[0] : "No report URL found.",
                    sessionId: sessionId,
                    error: error ? error.message : null
                }));
            });

        } catch (e) {
            console.error('JSON Parse Error', e);
            res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Bridge server running on port ${PORT}`);
});
