const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PYTHON_SCRIPT_PATH = path.join(__dirname, 'helper', 'get-session-from-steam-windows11.py');
const ENV_COOKIE_NAME = 'SHIPPING_MANAGER_COOKIE';

function sleepSync(ms) {
    const start = Date.now();
    while (Date.now() < start + ms) {}
}

function killSteam() {
    console.log(`[STEAM] Attempting to terminate Steam processes...`);
    try {
        execSync('taskkill /f /im steam.exe', { stdio: 'pipe' });
        console.log(`[STEAM] Steam.exe process terminated successfully.`);
        sleepSync(1000);
        return true;
    } catch (e) {
        console.log(`[STEAM] Steam was not running.`);
        return false;
    }
}

function restartSteam() {
    console.log(`[STEAM] Restarting Steam...`);
    try {
        const steamPath = os.arch() === 'x64'
            ? 'C:\\Program Files (x86)\\Steam\\steam.exe'
            : 'C:\\Program Files\\Steam\\steam.exe';

        if (fs.existsSync(steamPath)) {
            spawn(steamPath, [], {
                detached: true,
                stdio: 'ignore'
            }).unref();

            console.log(`[STEAM] Steam restarted. Waiting 5 seconds for startup...`);
            sleepSync(5000);
        } else {
            console.error(`[STEAM] Warning: Steam executable not found at ${steamPath}. Cannot restart.`);
        }
    } catch (e) {
        console.error(`[STEAM] Error during Steam restart:`, e.message);
    }
}

function getCookieAndStartApp() {
    const steamWasRunning = killSteam();

    console.log(`[*] Starting Python script (${PYTHON_SCRIPT_PATH}) for cookie decryption...`);

    if (!fs.existsSync(PYTHON_SCRIPT_PATH)) {
        console.error(`\nFATAL ERROR: The Python script for extraction was not found at: ${PYTHON_SCRIPT_PATH}`);
        return;
    }

    let sessionCookie;
    try {
        const rawOutput = execSync(`python.exe "${PYTHON_SCRIPT_PATH}"`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'inherit']
        });

        sessionCookie = rawOutput.trim();

        if (sessionCookie.length < 50) {
            throw new Error(`Invalid token length: Python script output was too short. Check stderr output above for Python errors.`);
        }
    } catch (error) {
        console.error(`\nFATAL ERROR: Could not read the session cookie.`);
        console.error(`Details: ${error.message}`);
        return;
    }

    process.env[ENV_COOKIE_NAME] = sessionCookie;

    console.log("-------------------------------------------------");
    console.log(`[JS] Session cookie successfully loaded.`);
    console.log(`[JS] Starting the main application (app.js)...`);
    console.log("-------------------------------------------------");

    try {
        require('./app.js');
    } catch (e) {
        console.error(`ERROR starting app.js:`, e);
    }

    return steamWasRunning;
}

let steamWasRunning = false;
try {
    steamWasRunning = getCookieAndStartApp();
} finally {
    if (steamWasRunning) {
        restartSteam();
    } else {
        console.log(`[STEAM] Skipping restart - Steam was not running initially.`);
    }
}