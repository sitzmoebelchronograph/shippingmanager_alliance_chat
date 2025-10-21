// run.js (Final Version with Process Control, Chat Server, and Browser Launcher)
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- CONFIGURATION ---
// PYTHON SCRIPT PATHS
const PYTHON_SCRIPT_PATH = path.join(__dirname, 'helper', 'get-session-from-steam-windows11.py'); 
const PYTHON_LAUNCHER_PATH = path.join(__dirname, 'launch-browser.py'); // NEUER PFAD
const ENV_COOKIE_NAME = 'SHIPPING_MANAGER_COOKIE'; 


// --- HELPER FUNCTIONS ---

/**
 * Synchronous sleep function to reliably pause execution without relying on Windows shell commands.
 * @param {number} ms - Milliseconds to wait
 */
function sleepSync(ms) {
    const start = Date.now();
    while (Date.now() < start + ms) {
        // Blocks the event loop synchronously
    }
}

// --- STEAM PROCESS CONTROL ---

function killSteam() {
    console.log(`[STEAM] Attempting to terminate Steam processes...`);
    try {
        // Use taskkill to forcibly close steam.exe
        execSync('taskkill /f /im steam.exe', { stdio: 'pipe' });
        console.log(`[STEAM] Steam.exe process terminated successfully.`);
        sleepSync(1000); // Wait 1 second to ensure the database lock is released
    } catch (e) {
        // This is fine if the process wasn't running
        if (!e.message.includes('not found')) {
            console.warn(`[STEAM] Note: Steam may not have been running, or termination failed. Continuing...`);
        }
    }
}

function restartSteam() {
    console.log(`[STEAM] Restarting Steam...`);
    try {
        // Determine the Steam installation path
        const steamPath = os.arch() === 'x64' 
            ? 'C:\\Program Files (x86)\\Steam\\steam.exe' 
            : 'C:\\Program Files\\Steam\\steam.exe';

        if (fs.existsSync(steamPath)) {
            // Use 'spawn' to launch Steam and detach the process, allowing the script to continue immediately.
            spawn(steamPath, [], {
                detached: true,
                stdio: 'ignore'
            }).unref(); // unref allows Node.js to exit even if the child process is still running
            
            console.log(`[STEAM] Steam restarted. Waiting 5 seconds for startup...`);
            
            // Use the native JS-based synchronous sleep for a reliable pause
            sleepSync(5000); // Wait 5 seconds
            
        } else {
            console.error(`[STEAM] Warning: Steam executable not found at ${steamPath}. Cannot restart.`);
        }
    } catch (e) {
        console.error(`[STEAM] Error during Steam restart:`, e.message);
    }
}


// --- MAIN PROCESS ---
function getCookieAndStartApp() {
    
    // STEP 1: KILL STEAM TO RELEASE DATABASE LOCK
    killSteam(); 

    // STEP 2: EXECUTE PYTHON SCRIPT AND EXTRACT COOKIE
    console.log(`[*] Starting Python script (${PYTHON_SCRIPT_PATH}) for cookie decryption...`);

    if (!fs.existsSync(PYTHON_SCRIPT_PATH)) {
        console.error(`\nFATAL ERROR: The Python script for extraction was not found at: ${PYTHON_SCRIPT_PATH}`);
        return;
    }

    let sessionCookie;
    try {
        // Execute Python and capture its stdout (the token)
        const rawOutput = execSync(`python.exe "${PYTHON_SCRIPT_PATH}"`, { 
            encoding: 'utf8',
            // Pipe stdout, inherit stderr (errors from Python print directly)
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

    // STEP 3: START APPLICATIONS

    // Set the cookie into the environment for app.js
    process.env[ENV_COOKIE_NAME] = sessionCookie;

    console.log("-------------------------------------------------");
    console.log(`[JS] Session cookie successfully loaded.`);
    console.log(`[JS] Starting the main application (app.js) and the browser launcher...`);
    console.log("-------------------------------------------------");

    // 3a: Start the Node.js Chat Server (app.js)
    try {
        require('./app.js');
    } catch (e) {
        console.error(`ERROR starting app.js:`, e);
    }

    // 3b: Launch the Game in a separate browser via Python
    if (!fs.existsSync(PYTHON_LAUNCHER_PATH)) {
        console.error(`\nWARNING: The browser launcher script was not found at: ${PYTHON_LAUNCHER_PATH}. Skipping browser launch.`);
        return;
    }

    try {
        console.log(`[JS] Launching game in new browser window via Python...`);
        // Start the Python script as a detached child process, passing the cookie as an argument
        const browserProcess = spawn('python.exe', [PYTHON_LAUNCHER_PATH, sessionCookie], {
            detached: true, 
            stdio: 'inherit' // Shows the output/errors of the Python script
        });
        browserProcess.unref(); // Allows Node.js to exit even if the browser process is still running

        console.log(`[JS] Browser launcher started (PID: ${browserProcess.pid}).`);

    } catch (e) {
        console.error(`ERROR launching browser via Python:`, e.message);
    }
}

// --- EXECUTION CHAIN ---
try {
    getCookieAndStartApp();
} finally {
    // STEP 4: RESTART STEAM (Guaranteed to run, even if the app crashes)
    restartSteam(); 
}