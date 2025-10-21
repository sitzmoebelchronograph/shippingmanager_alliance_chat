// websocket.js - WebSocket Server and Chat Updates

const WebSocket = require('ws');
const { getChatFeed, getCompanyName, getAllianceId } = require('./utils/api');
const config = require('./config');

let wss = null;
let chatRefreshInterval = null;

/**
 * Initialize WebSocket server
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
 * Broadcast to all WebSocket clients
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
 * Start auto-refresh chat
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
 * Stop auto-refresh chat
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
