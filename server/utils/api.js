/**
 * @fileoverview API Helper Functions and Game API Integration
 *
 * This module provides centralized API communication with the Shipping Manager game server
 * (shippingmanager.cc). It handles authentication, connection pooling, state management,
 * and caching to optimize API calls and reduce rate limit risk.
 *
 * Key Responsibilities:
 * - Authenticated API calls with session cookie injection
 * - HTTP Keep-Alive connection pooling for performance
 * - User and alliance state initialization and management
 * - Company name caching to reduce redundant API calls
 * - Error handling and fallback mechanisms
 *
 * Why This Architecture:
 * - Centralizes all game API communication in one module
 * - Connection pooling reduces latency (reuses TCP connections)
 * - State caching reduces API load (important for rate limiting)
 * - Session cookie injected from environment (extracted by run.js)
 * - Graceful degradation when user not in alliance
 *
 * Connection Pooling Strategy:
 * - Keep-Alive enabled: Reuses TCP connections instead of opening new ones
 * - Max 10 simultaneous connections: Prevents overwhelming API server
 * - LIFO scheduling: Most recently used socket first (better connection reuse)
 * - 30-second keep-alive: Balance between connection reuse and resource usage
 * - This mimics normal browser behavior, reducing detection risk
 *
 * State Management:
 * - USER_ID: Current user's unique identifier
 * - USER_COMPANY_NAME: Current user's company name
 * - ALLIANCE_ID: User's alliance ID (null if not in alliance)
 * - userNameCache: Map of user_id → company_name (reduces API calls)
 *
 * Rate Limiting Considerations:
 * - Fewer API calls via caching = lower rate limit risk
 * - Keep-Alive reduces overhead, faster responses
 * - Connection pooling prevents connection exhaustion
 * - Mimics normal browser traffic patterns
 *
 * @requires axios - HTTP client for API calls
 * @requires https - HTTPS agent configuration
 * @requires ../config - Configuration constants (API URL, session cookie)
 * @module server/utils/api
 */

const axios = require('axios');
const https = require('https');
const config = require('../config');

/**
 * User's alliance ID (null if not in alliance)
 * @type {number|null}
 */
let ALLIANCE_ID = null;

/**
 * Current user's unique identifier
 * @type {number|null}
 */
let USER_ID = null;

/**
 * Current user's company name
 * @type {string|null}
 */
let USER_COMPANY_NAME = null;

/**
 * Cache mapping user IDs to company names (reduces API calls)
 * @type {Map<number, string>}
 */
const userNameCache = new Map();

/**
 * HTTPS agent with Keep-Alive for connection pooling and performance optimization.
 *
 * This agent maintains persistent TCP connections to the game API server, reducing
 * latency and overhead from repeatedly establishing TLS handshakes.
 *
 * Configuration Rationale:
 * - keepAlive: true - Reuses connections instead of opening new ones per request
 * - keepAliveMsecs: 30s - TCP keep-alive packets every 30 seconds
 * - maxSockets: 10 - Limits concurrent connections (avoids API server overload)
 * - maxFreeSockets: 5 - Keeps 5 idle connections ready for immediate reuse
 * - timeout: 30s - Socket timeout (prevents hanging connections)
 * - scheduling: 'lifo' - Uses most recently used socket first (better cache locality)
 *
 * Anti-Detection Benefits:
 * - Connection pooling mimics normal browser behavior
 * - Limits concurrent connections (doesn't look like a bot storm)
 * - Keep-Alive is standard browser feature
 * - Reduces number of TLS handshakes (less suspicious traffic pattern)
 *
 * @constant {https.Agent}
 */
const httpsAgent = new https.Agent({
  keepAlive: true,                // Enable Keep-Alive
  keepAliveMsecs: 30000,          // Keep connections alive for 30 seconds
  maxSockets: 10,                 // Max 10 simultaneous connections (good for anti-detection)
  maxFreeSockets: 5,              // Max 5 idle sockets
  timeout: 30000,                 // Socket timeout 30s
  scheduling: 'lifo'              // Use most recently used socket first
});

/**
 * Makes authenticated HTTP API calls to the Shipping Manager game server.
 *
 * This is the core function for all API communication. It handles authentication
 * via session cookie, sets appropriate headers to mimic browser requests, and
 * uses connection pooling for performance.
 *
 * Why This Design:
 * - Centralizes authentication logic (session cookie from environment)
 * - Mimics browser requests (headers, user agent, origin)
 * - Uses Keep-Alive agent for connection reuse
 * - Consistent error handling across all API calls
 * - 30-second timeout prevents hanging requests
 *
 * Authentication:
 * - Session cookie injected via config.SESSION_COOKIE
 * - Cookie extracted from Steam client by run.js Python script
 * - Provides full account access (same as logged-in browser session)
 * - Cookie never stored in files (only in environment variable)
 *
 * Headers:
 * - User-Agent: Mozilla/5.0 (looks like browser, not bot)
 * - Origin: https://shippingmanager.cc (required for CORS)
 * - Content-Type: application/json (API expects JSON)
 * - Accept: application/json (indicates we want JSON response)
 * - Cookie: Session authentication
 *
 * Error Handling:
 * - HTTP errors: Extracts status code from response
 * - Network errors: Returns error message
 * - Logs errors to console for debugging
 * - Throws error for caller to handle
 *
 * Side Effects:
 * - Makes HTTPS request to shippingmanager.cc
 * - Reuses existing TCP connections via Keep-Alive agent
 * - Logs errors to console
 *
 * @function apiCall
 * @param {string} endpoint - API endpoint (e.g., '/alliance/get-chat-feed')
 * @param {string} [method='POST'] - HTTP method (GET, POST, etc.)
 * @param {Object} [body={}] - Request payload (will be JSON stringified)
 * @returns {Promise<Object>} API response data (already parsed from JSON)
 * @throws {Error} When API request fails (network error or HTTP error status)
 *
 * @example
 * // Fetch alliance chat feed
 * const data = await apiCall('/alliance/get-chat-feed', 'POST', { alliance_id: 123 });
 * console.log(data.data.chat_feed);
 *
 * @example
 * // Get user settings (default POST method, empty body)
 * const userData = await apiCall('/user/get-user-settings');
 * console.log(userData.user.company_name);
 */
async function apiCall(endpoint, method = 'POST', body = {}) {
  try {
    const response = await axios({
      method,
      url: `${config.SHIPPING_MANAGER_API}${endpoint}`,
      data: body,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://shippingmanager.cc',
        'Cookie': `shipping_manager_session=${config.SESSION_COOKIE}`
      },
      httpsAgent: httpsAgent,      // Use Keep-Alive agent
      timeout: 30000                // Request timeout 30s
    });
    return response.data;
  } catch (error) {
    const errorMessage = error.response
      ? `Request failed with status code ${error.response.status}`
      : error.message;
    console.error(`API Error: ${endpoint} ${errorMessage}`);
    throw new Error(errorMessage);
  }
}

/**
 * Retrieves a user's company name with intelligent caching to reduce API calls.
 *
 * This function implements a memory cache for company names, significantly reducing
 * API calls during chat feed processing. The cache persists for the lifetime of the
 * server process.
 *
 * Why Caching Matters:
 * - Chat feeds can contain 50+ messages from same users
 * - Without cache: 50 API calls per chat refresh (25s interval)
 * - With cache: ~2-3 API calls per refresh (only new users)
 * - Reduces rate limit risk by 95%+
 * - Faster response times (cache lookup vs network roundtrip)
 *
 * Cache Strategy:
 * - Map-based cache: O(1) lookup time
 * - Persistent: Cache never cleared (safe assumption: usernames don't change often)
 * - Grows linearly with unique users seen (minimal memory impact)
 * - Thread-safe: Node.js single-threaded, no race conditions
 *
 * Fallback Behavior:
 * - If API call fails (user deleted, API error), returns "User {userId}"
 * - Prevents cascade failures from missing user data
 * - Silent error handling (no throw, no log spam)
 *
 * Side Effects:
 * - Makes API call to /user/get-company on cache miss
 * - Stores result in userNameCache Map
 * - Logs errors silently (doesn't log to console)
 *
 * @function getCompanyName
 * @param {number} userId - User's unique identifier
 * @returns {Promise<string>} Company name (from cache or API) or "User {userId}" on failure
 *
 * @example
 * const name = await getCompanyName(12345);
 * console.log(name); // "ABC Shipping Co."
 * // Second call returns instantly from cache
 * const nameAgain = await getCompanyName(12345);
 *
 * @example
 * // Failed API call
 * const name = await getCompanyName(99999); // Deleted user
 * console.log(name); // "User 99999"
 */
async function getCompanyName(userId) {
  if (userNameCache.has(userId)) {
    return userNameCache.get(userId);
  }

  try {
    const data = await apiCall('/user/get-company', 'POST', { user_id: userId });
    const companyName = data.data.company.company_name;
    userNameCache.set(userId, companyName);
    return companyName;
  } catch {
    return `User ${userId}`;
  }
}

/**
 * Initializes user and alliance state on server startup.
 *
 * This critical initialization function loads user identity and alliance membership
 * from the game API. It must complete successfully before the server can function,
 * as many endpoints depend on USER_ID and ALLIANCE_ID state.
 *
 * Why This Runs at Startup:
 * - USER_ID needed for filtering own messages in chat
 * - ALLIANCE_ID required for all alliance-specific endpoints
 * - Company name used for logging and debugging
 * - Early failure prevents server from running with invalid state
 * - Session cookie validation (fails if cookie invalid/expired)
 *
 * Initialization Sequence:
 * 1. Load user settings (USER_ID, USER_COMPANY_NAME)
 *    - Endpoint: /user/get-user-settings
 *    - Always required - exits if fails
 * 2. Attempt to load alliance membership
 *    - Endpoint: /alliance/get-user-alliance
 *    - Optional - sets ALLIANCE_ID to null if not in alliance
 *
 * Graceful Degradation:
 * - User not in alliance: ALLIANCE_ID = null, continues running
 * - Alliance endpoints will return empty arrays
 * - Chat auto-refresh skips when ALLIANCE_ID is null
 * - Other features (vessels, bunker, etc.) still work
 *
 * Failure Modes:
 * - User settings fail: process.exit(1) - Critical failure
 * - Alliance API error: Treats as "not in alliance" - Non-critical
 * - Invalid session cookie: User settings fail → exit
 * - Network error: User settings fail → exit
 *
 * Side Effects:
 * - Sets module-level variables: USER_ID, USER_COMPANY_NAME, ALLIANCE_ID
 * - Makes 1-2 API calls on startup
 * - Logs initialization status to console
 * - Exits process (process.exit(1)) if user settings fail
 *
 * @function initializeAlliance
 * @returns {Promise<void>}
 * @throws {Error} Never throws - exits process on critical failure
 *
 * @example
 * // Called from app.js during server startup
 * await initializeAlliance();
 * // Console output:
 * // ✓ User loaded: ABC Shipping Co. (ID: 12345)
 * // ✓ Alliance loaded: Best Alliance (ID: 67890)
 *
 * @example
 * // User not in alliance
 * await initializeAlliance();
 * // Console output:
 * // ✓ User loaded: ABC Shipping Co. (ID: 12345)
 * // ⚠ User is not in an alliance
 */
async function initializeAlliance() {
  try {
    // 1. Load User ID and Company Name first
    const userData = await apiCall('/user/get-user-settings', 'POST', {});
    USER_ID = userData.user.id;
    USER_COMPANY_NAME = userData.user.company_name;
    console.log(`✓ User loaded: ${USER_COMPANY_NAME} (ID: ${USER_ID})`);

    // 2. Try to load Alliance ID
    try {
      const allianceData = await apiCall('/alliance/get-user-alliance', 'POST', {});
      if (allianceData.data && allianceData.data.alliance && allianceData.data.alliance.id) {
        ALLIANCE_ID = allianceData.data.alliance.id;
        console.log(`✓ Alliance loaded: ${allianceData.data.alliance.name} (ID: ${ALLIANCE_ID})`);
      } else {
        ALLIANCE_ID = null;
        console.log(`⚠ User is not in an alliance`);
      }
    } catch (allianceError) {
      ALLIANCE_ID = null;
      console.log(`⚠ User is not in an alliance`);
    }
  } catch (error) {
    console.error('Failed to initialize:', error.message);
    process.exit(1);
  }
}

/**
 * Fetches the alliance chat feed from the game API.
 *
 * This function retrieves all recent messages and feed events for the user's alliance.
 * It's used by WebSocket auto-refresh (every 25 seconds) and manual chat refresh requests.
 *
 * Why This Function:
 * - Centralizes chat feed retrieval logic
 * - Handles "no alliance" case gracefully (returns empty array)
 * - Error handling prevents crashes during network issues
 * - Used by both WebSocket auto-refresh and manual refresh endpoints
 *
 * Feed Contents:
 * - Chat messages: User messages with message text, user_id, timestamp
 * - Feed events: Alliance joins, route completions, system announcements
 * - Typically last 50-100 items (game API decides)
 * - Ordered by time_created (most recent last)
 *
 * No Alliance Handling:
 * - Returns empty array immediately if ALLIANCE_ID is null
 * - Prevents 404 errors from /alliance/get-chat-feed endpoint
 * - Allows app to work for users not in alliance
 *
 * Error Handling:
 * - API errors caught and logged
 * - Returns empty array on error (prevents crash)
 * - Silent failures (doesn't throw, doesn't stop auto-refresh)
 *
 * Side Effects:
 * - Makes API call to /alliance/get-chat-feed
 * - Logs errors to console
 *
 * @function getChatFeed
 * @returns {Promise<Array>} Array of chat messages and feed events, or empty array if no alliance/error
 *
 * @example
 * const feed = await getChatFeed();
 * // Returns:
 * // [
 * //   { type: 'chat', user_id: 123, message: 'Hello!', time_created: 1729695000 },
 * //   { type: 'feed', feed_type: 'route_completed', replacements: {...}, time_created: 1729694500 }
 * // ]
 *
 * @example
 * // User not in alliance
 * const feed = await getChatFeed();
 * console.log(feed); // []
 */
async function getChatFeed() {
  if (!ALLIANCE_ID) {
    return [];
  }

  try {
    const data = await apiCall('/alliance/get-chat-feed', 'POST', { alliance_id: ALLIANCE_ID });
    return data.data.chat_feed;
  } catch (error) {
    console.error('Error loading chat feed:', error.message);
    return [];
  }
}

/**
 * Returns the current user's alliance ID.
 *
 * This getter provides read-only access to the alliance ID state variable.
 * Used by routes and WebSocket module to check alliance membership.
 *
 * @function getAllianceId
 * @returns {number|null} Alliance ID or null if user not in alliance
 *
 * @example
 * const allianceId = getAllianceId();
 * if (allianceId) {
 *   // User is in alliance, show alliance features
 * }
 */
function getAllianceId() {
  return ALLIANCE_ID;
}

/**
 * Returns the current user's unique identifier.
 *
 * This getter provides read-only access to the user ID state variable.
 * Used by routes to filter messages, identify ownership, etc.
 *
 * @function getUserId
 * @returns {number|null} User ID or null if not initialized
 *
 * @example
 * const userId = getUserId();
 * const isOwnMessage = message.user_id === userId;
 */
function getUserId() {
  return USER_ID;
}

/**
 * Returns the current user's company name.
 *
 * This getter provides read-only access to the company name state variable.
 * Used for logging, debugging, and UI display.
 *
 * @function getUserCompanyName
 * @returns {string|null} Company name or null if not initialized
 *
 * @example
 * const companyName = getUserCompanyName();
 * console.log(`Logged in as: ${companyName}`);
 */
function getUserCompanyName() {
  return USER_COMPANY_NAME;
}

module.exports = {
  apiCall,
  getCompanyName,
  initializeAlliance,
  getChatFeed,
  getAllianceId,
  getUserId,
  getUserCompanyName
};
