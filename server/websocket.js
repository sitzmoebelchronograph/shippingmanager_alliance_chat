/**
 * @fileoverview WebSocket Server and Real-Time Chat Update Management
 *
 * This module manages bidirectional real-time communication between the server and connected
 * browser clients using WebSocket protocol. It implements automatic chat feed broadcasting
 * at regular intervals to keep all connected clients synchronized with alliance chat updates.
 *
 * Key Features:
 * - WebSocket server initialization and connection lifecycle management
 * - Automatic chat feed polling every 25 seconds (configurable in config.js)
 * - Broadcast system pushing updates to all connected clients simultaneously
 * - Message transformation (converting API format to client-ready format)
 * - Company name caching to reduce API calls during message processing
 * - Graceful handling of users not in alliance (skips polling)
 *
 * Why This Architecture:
 * - HTTP polling from frontend would be inefficient and waste bandwidth
 * - Server-side polling centralizes API calls (1 API call → N clients)
 * - WebSocket enables instant push updates without client polling
 * - Automatic refresh ensures clients stay synchronized even if inactive
 * - 25-second interval balances freshness with rate limit compliance
 *
 * Message Flow:
 *   API (25s interval) → getChatFeed() → Transform Messages → Broadcast → All Clients
 *
 * WebSocket Protocol:
 * - Messages sent as JSON strings: { type: 'chat_update', data: [...messages] }
 * - Client connects via wss://localhost:12345 (secure WebSocket)
 * - Server broadcasts to all OPEN connections only (skips CONNECTING/CLOSING states)
 *
 * Rate Limiting Consideration:
 * - One server-side API call every 25 seconds for all clients
 * - Without WebSocket, 10 clients would make 10 API calls every 25 seconds
 * - Centralized polling reduces API load by factor of N (number of clients)
 *
 * @requires ws - WebSocket server implementation
 * @requires ./utils/api - API helper functions (getChatFeed, getCompanyName, getAllianceId)
 * @requires ./config - Configuration constants (CHAT_REFRESH_INTERVAL)
 * @module server/websocket
 */

const WebSocket = require('ws');
const { getChatFeed, getCompanyName, getAllianceId } = require('./utils/api');
const config = require('./config');

/**
 * WebSocket server instance (shared across all connections)
 * @type {WebSocket.Server|null}
 */
let wss = null;

/**
 * Interval timer for automatic chat refresh (25-second polling)
 * @type {NodeJS.Timeout|null}
 */
let chatRefreshInterval = null;

/**
 * Initializes the WebSocket server and sets up connection event handlers.
 *
 * This function creates a WebSocket server that operates in "noServer" mode, meaning
 * it shares the HTTPS server's port rather than opening a separate port. The upgrade
 * from HTTP to WebSocket happens via the HTTP server's 'upgrade' event (handled in app.js).
 *
 * Why noServer Mode:
 * - Shares HTTPS port 12345 instead of requiring separate WebSocket port
 * - Simplifies firewall configuration (one port instead of two)
 * - Works seamlessly with HTTPS and self-signed certificates
 * - Standard pattern for integrating WebSocket with Express
 *
 * Connection Lifecycle:
 * 1. Client sends HTTP Upgrade request to wss://localhost:12345
 * 2. Server upgrades connection to WebSocket protocol
 * 3. 'connection' event fires, logging "Client connected"
 * 4. Client remains connected until page close or network interruption
 * 5. 'close' event fires, logging "Client disconnected"
 *
 * Error Handling:
 * - Errors logged to console but don't crash server
 * - Clients can reconnect automatically after errors
 *
 * Side Effects:
 * - Sets module-level `wss` variable for use in broadcast()
 * - Logs connection/disconnection events to console
 *
 * @function initWebSocket
 * @param {https.Server} server - HTTPS server instance (from app.js)
 * @returns {WebSocket.Server} WebSocket server instance
 *
 * @example
 * const server = createHttpsServer(app);
 * const wss = initWebSocket(server);
 * // WebSocket server now listening for upgrade requests
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ noServer: true });

  wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('close', () => {
      console.log('Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
  });

  return wss;
}

/**
 * Broadcasts a message to all connected WebSocket clients.
 *
 * This function sends data to every client currently connected to the WebSocket server.
 * It only sends to clients in OPEN state (connected and ready), skipping clients that
 * are CONNECTING, CLOSING, or CLOSED.
 *
 * Why This Pattern:
 * - Centralized broadcast logic used by multiple features (chat updates, system notifications)
 * - Automatically skips clients in transitional states to prevent errors
 * - Type-based routing allows frontend to handle different message types appropriately
 * - JSON serialization ensures structured data transmission
 *
 * Message Format:
 * {
 *   type: 'chat_update' | 'system_notification' | ...,
 *   data: <any>
 * }
 *
 * Safety Features:
 * - Early return if WebSocket server not initialized
 * - readyState check prevents sending to disconnecting clients
 * - JSON.stringify errors won't crash server (client.send handles errors)
 *
 * Use Cases:
 * - Chat feed updates every 25 seconds
 * - New message notifications
 * - System status updates
 * - Real-time game state changes
 *
 * @function broadcast
 * @param {string} type - Message type for client-side routing (e.g., 'chat_update')
 * @param {*} data - Payload data (will be JSON serialized)
 * @returns {void}
 *
 * @example
 * broadcast('chat_update', [
 *   { type: 'chat', company: 'ABC Corp', message: 'Hello!' }
 * ]);
 * // Sends to all connected clients:
 * // {"type":"chat_update","data":[{"type":"chat",...}]}
 *
 * @example
 * broadcast('system_notification', { message: 'Server restarting in 5 minutes' });
 */
function broadcast(type, data) {
  if (!wss) return;

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, data }));
    }
  });
}

/**
 * Starts automatic chat feed polling and broadcasting to all connected clients.
 *
 * This function implements server-side polling of the alliance chat feed at regular intervals
 * (25 seconds by default). It fetches chat messages from the game API, transforms them into
 * a client-friendly format, and broadcasts updates to all connected WebSocket clients.
 *
 * Why Server-Side Polling:
 * - Centralizes API calls (one call serves all clients)
 * - Reduces game API load compared to per-client polling
 * - Ensures all clients stay synchronized with same data
 * - Complies with rate limiting (30 req/min across all clients)
 * - Clients receive updates even when browser tab is inactive
 *
 * Polling Interval:
 * - Default: 25 seconds (config.CHAT_REFRESH_INTERVAL)
 * - Balances freshness with API rate limits
 * - 25s = 2.4 calls/minute, well below 30 req/min limit
 * - Leaves headroom for manual chat sends and other API operations
 *
 * Message Types Handled:
 * 1. Chat Messages (type: 'chat')
 *    - Fetches company name via getCompanyName() with caching
 *    - Converts Unix timestamp to UTC string
 *    - Includes user_id for sender identification
 *
 * 2. Feed Events (type: 'feed')
 *    - Alliance member joins, route completions, etc.
 *    - Already includes company name in replacements
 *    - No additional API call needed
 *
 * No Alliance Handling:
 * - Checks getAllianceId() every interval
 * - If null (user not in alliance), skips API call
 * - Prevents 404 errors from alliance-specific endpoints
 * - Allows app to work for non-alliance users
 *
 * Error Handling:
 * - API errors logged but don't stop polling
 * - Interval continues running even if one fetch fails
 * - Prevents cascading failures from transient network issues
 *
 * Side Effects:
 * - Makes API call to /alliance/get-feed every 25 seconds
 * - May make multiple API calls to /user/get-user-settings for uncached company names
 * - Broadcasts to all connected WebSocket clients
 * - Sets module-level chatRefreshInterval variable
 *
 * @function startChatAutoRefresh
 * @returns {void}
 *
 * @example
 * // Called from app.js during server initialization
 * startChatAutoRefresh();
 * // Begins polling every 25 seconds
 * // Broadcasts chat_update messages to all connected clients
 *
 * @example
 * // Typical broadcast message structure:
 * {
 *   type: 'chat_update',
 *   data: [
 *     {
 *       type: 'chat',
 *       company: 'ABC Shipping',
 *       message: 'Hello everyone!',
 *       timestamp: 'Mon, 23 Oct 2025 14:30:00 GMT',
 *       user_id: 12345
 *     },
 *     {
 *       type: 'feed',
 *       feedType: 'alliance_member_joined',
 *       company: 'XYZ Corp',
 *       timestamp: 'Mon, 23 Oct 2025 14:25:00 GMT'
 *     }
 *   ]
 * }
 */
function startChatAutoRefresh() {
  chatRefreshInterval = setInterval(async () => {
    if (!getAllianceId()) {
      return;
    }

    try {
      const feed = await getChatFeed();
      const messages = [];

      for (const msg of feed) {
        if (msg.type === 'chat') {
          const companyName = await getCompanyName(msg.user_id);
          const timestamp = new Date(msg.time_created * 1000).toUTCString();
          messages.push({
            type: 'chat',
            company: companyName,
            message: msg.message,
            timestamp: timestamp,
            user_id: msg.user_id
          });
        } else if (msg.type === 'feed') {
          const timestamp = new Date(msg.time_created * 1000).toUTCString();
          messages.push({
            type: 'feed',
            feedType: msg.feed_type,
            company: msg.replacements.company_name,
            timestamp: timestamp
          });
        }
      }

      if (messages.length > 0 || wss.clients.size > 0) {
        broadcast('chat_update', messages);
      }
    } catch (error) {
      console.error('Auto-refresh error:', error.message);
    }
  }, config.CHAT_REFRESH_INTERVAL);
}

/**
 * Stops the automatic chat feed polling and clears the interval timer.
 *
 * This function provides a clean shutdown mechanism for the chat auto-refresh feature.
 * It's primarily used during server shutdown or when temporarily disabling automatic updates.
 *
 * Why This Matters:
 * - Prevents interval from continuing after server shutdown
 * - Cleans up resources properly to avoid memory leaks
 * - Allows pausing auto-refresh without restarting server
 * - Sets interval reference to null for garbage collection
 *
 * Use Cases:
 * - Server graceful shutdown (SIGTERM/SIGINT handlers)
 * - Temporarily disabling auto-refresh for maintenance
 * - Reconfiguring refresh interval (stop, then restart with new interval)
 *
 * Side Effects:
 * - Clears the setInterval timer
 * - Sets chatRefreshInterval to null
 * - No more automatic broadcasts until startChatAutoRefresh() called again
 *
 * @function stopChatAutoRefresh
 * @returns {void}
 *
 * @example
 * // During server shutdown
 * process.on('SIGTERM', () => {
 *   console.log('Shutting down server...');
 *   stopChatAutoRefresh();
 *   server.close();
 * });
 *
 * @example
 * // Reconfiguring refresh interval
 * stopChatAutoRefresh();
 * config.CHAT_REFRESH_INTERVAL = 30000; // Change to 30 seconds
 * startChatAutoRefresh();
 */
function stopChatAutoRefresh() {
  if (chatRefreshInterval) {
    clearInterval(chatRefreshInterval);
    chatRefreshInterval = null;
  }
}

module.exports = {
  initWebSocket,
  broadcast,
  startChatAutoRefresh,
  stopChatAutoRefresh
};
