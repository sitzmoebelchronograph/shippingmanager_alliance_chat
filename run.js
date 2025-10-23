/**
 * @fileoverview Process orchestration wrapper for Shipping Manager CoPilot application startup.
 * This module manages the complete application lifecycle including Steam process management,
 * session cookie extraction, and server initialization. It ensures the Steam database is
 * released before extraction and restarts Steam after successful cookie retrieval.
 *
 * Startup sequence:
 * 1. Terminate Steam process to release database lock
 * 2. Execute Python script to extract session cookie from encrypted Steam cache (DPAPI)
 * 3. Inject cookie into environment variables for app.js
 * 4. Start the Express HTTPS server (app.js)
 * 5. Restart Steam client if it was running initially
 *
 * Security: Session cookie is NEVER written to disk - only stored in process environment.
 *
 * @module run
 * @requires child_process
 * @requires path
 * @requires fs
 * @requires os
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Path to Python script that extracts session cookie from Steam's encrypted database.
 * Uses Windows DPAPI decryption to read the shipping_manager_session cookie.
 * @constant {string}
 */
const PYTHON_SCRIPT_PATH = path.join(__dirname, 'helper', 'get-session-from-steam-windows11.py');

/**
 * Environment variable name used to inject session cookie into app.js process.
 * @constant {string}
 */
const ENV_COOKIE_NAME = 'SHIPPING_MANAGER_COOKIE';

/**
 * Synchronous sleep function using busy-waiting.
 * Blocks execution for the specified duration without using setTimeout/Promise.
 * Used to ensure processes have time to fully terminate before proceeding.
 *
 * @param {number} ms - Milliseconds to sleep (blocking)
 * @returns {void}
 * @example
 * sleepSync(1000); // Blocks for 1 second
 */
function sleepSync(ms) {
    const start = Date.now();
    while (Date.now() < start + ms) {}
}

/**
 * Terminates the Steam client process to release database locks.
 * This is necessary because Steam locks its cookie database (Cookies file) while running,
 * preventing the Python script from accessing and decrypting the session cookie.
 * Uses Windows taskkill command to force-terminate steam.exe.
 *
 * @returns {boolean} True if Steam was running and successfully terminated, false if Steam was not running
 * @throws {Error} If taskkill command fails for reasons other than process not found
 * @example
 * const wasRunning = killSteam();
 * // => true (Steam was running and has been terminated)
 */
function killSteam() {
    console.log(`[STEAM] Attempting to terminate Steam processes...`);
    try {
        execSync('taskkill /f /im steam.exe', { stdio: 'pipe' });
        console.log(`[STEAM] Steam.exe process terminated successfully.`);
        sleepSync(1000); // Wait for process cleanup
        return true;
    } catch (e) {
        console.log(`[STEAM] Steam was not running.`);
        return false;
    }
}

/**
 * Restarts the Steam client application.
 * Detects correct Steam installation path based on system architecture (x64 vs x86),
 * spawns Steam as a detached process (continues running after Node.js exits),
 * and waits 5 seconds for Steam to initialize.
 *
 * Steam installation paths:
 * - x64 systems: C:\Program Files (x86)\Steam\steam.exe
 * - x86 systems: C:\Program Files\Steam\steam.exe
 *
 * @returns {void}
 * @throws {Error} Logs error if Steam executable is not found or spawn fails
 * @example
 * restartSteam();
 * // Starts Steam in detached mode and waits 5 seconds for initialization
 */
function restartSteam() {
    console.log(`[STEAM] Restarting Steam...`);
    try {
        const steamPath = os.arch() === 'x64'
            ? 'C:\\Program Files (x86)\\Steam\\steam.exe'
            : 'C:\\Program Files\\Steam\\steam.exe';

        if (fs.existsSync(steamPath)) {
            spawn(steamPath, [], {
                detached: true,      // Process continues after parent exits
                stdio: 'ignore'      // Don't pipe output to parent process
            }).unref();              // Allow parent to exit independently

            console.log(`[STEAM] Steam restarted. Waiting 5 seconds for startup...`);
            sleepSync(5000);         // Wait for Steam initialization
        } else {
            console.error(`[STEAM] Warning: Steam executable not found at ${steamPath}. Cannot restart.`);
        }
    } catch (e) {
        console.error(`[STEAM] Error during Steam restart:`, e.message);
    }
}

/**
 * Main orchestration function: extracts session cookie and starts the application.
 * This function coordinates the complete startup process:
 * 1. Terminates Steam to release database lock
 * 2. Executes Python script to decrypt and extract shipping_manager_session cookie
 * 3. Validates cookie format (must be at least 50 characters)
 * 4. Injects cookie into process environment for app.js to use
 * 5. Starts the Express server by requiring app.js
 *
 * Security note: Cookie is stored ONLY in process.env, never written to disk.
 *
 * @returns {boolean|undefined} True if Steam was running initially, false if not, undefined if script failed
 * @throws {Error} Logs fatal error if Python script is not found or cookie extraction fails
 * @example
 * const wasRunning = getCookieAndStartApp();
 * // => true (Steam was running, cookie extracted, app.js started)
 */
function getCookieAndStartApp() {
    const steamWasRunning = killSteam();

    console.log(`[*] Starting Python script (${PYTHON_SCRIPT_PATH}) for cookie decryption...`);

    if (!fs.existsSync(PYTHON_SCRIPT_PATH)) {
        console.error(`\nFATAL ERROR: The Python script for extraction was not found at: ${PYTHON_SCRIPT_PATH}`);
        return;
    }

    let sessionCookie;
    try {
        // Execute Python script to decrypt Steam database and extract cookie
        const rawOutput = execSync(`python.exe "${PYTHON_SCRIPT_PATH}"`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'inherit']  // Inherit stderr for error messages
        });

        sessionCookie = rawOutput.trim();

        // Validate cookie format (session cookies are typically >50 characters)
        if (sessionCookie.length < 50) {
            throw new Error(`Invalid token length: Python script output was too short. Check stderr output above for Python errors.`);
        }
    } catch (error) {
        console.error(`\nFATAL ERROR: Could not read the session cookie.`);
        console.error(`Details: ${error.message}`);
        return;
    }

    // Inject cookie into environment for app.js to consume
    process.env[ENV_COOKIE_NAME] = sessionCookie;

    console.log("-------------------------------------------------");
    console.log(`[JS] Session cookie successfully loaded.`);
    console.log(`[JS] Starting the main application (app.js)...`);
    console.log("-------------------------------------------------");

    try {
        // Start Express server (app.js will read cookie from process.env)
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