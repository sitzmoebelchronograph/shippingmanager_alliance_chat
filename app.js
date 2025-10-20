// app.js - Shipping Manager Alliance Chat Web App
// Run: npm install express ws axios dotenv helmet validator express-rate-limit
// Then: node app.js

const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = 12345;

// Configuration
const SHIPPING_MANAGER_API = 'https://shippingmanager.cc/api';
const SESSION_COOKIE = process.env.SHIPPING_MANAGER_COOKIE || 'YOUR_TOKEN_COOKIE_HERE';
let ALLIANCE_ID = null;
const userNameCache = new Map();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws://localhost:12345"]
    }
  }
}));
app.use(express.json({ limit: '1kb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests, please try again later'
});

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many messages, please wait before sending again'
});

app.use(limiter);

// WebSocket Setup
const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

// Helper: Make API calls with authentication
async function apiCall(endpoint, method = 'POST', body = {}) {
  try {
    const response = await axios({
      method,
      url: `${SHIPPING_MANAGER_API}${endpoint}`,
      data: body,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://shippingmanager.cc',
        'Cookie': `shipping_manager_session=${SESSION_COOKIE}`
      }
    });
    return response.data;
  } catch (error) {
    console.error(`API Error: ${endpoint}`, error.message);
    throw error;
  }
}

// Get company name from cache or API
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

// Load alliance ID on startup
async function initializeAlliance() {
  try {
    const data = await apiCall('/alliance/get-user-alliance', 'POST', {});
    ALLIANCE_ID = data.data.alliance.id;
    console.log(`✓ Alliance loaded: ${data.data.alliance.name} (ID: ${ALLIANCE_ID})`);
  } catch (error) {
    console.error('Failed to load alliance:', error.message);
    process.exit(1);
  }
}

// Get chat feed
async function getChatFeed() {
  try {
    const data = await apiCall('/alliance/get-chat-feed', 'POST', { alliance_id: ALLIANCE_ID });
    return data.data.chat_feed;
  } catch (error) {
    console.error('Failed to load chat feed:', error.message);
    return [];
  }
}

// Send message
async function sendMessage(message) {
  try {
    await apiCall('/alliance/post-chat', 'POST', {
      alliance_id: ALLIANCE_ID,
      text: message
    });
    console.log('✓ Message sent');
  } catch (error) {
    console.error('Failed to send message:', error.message);
    throw error;
  }
}

// Broadcast to all WebSocket clients
function broadcast(type, data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, data }));
    }
  });
}

// Auto-refresh chat every 25 seconds
setInterval(async () => {
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
          timestamp: timestamp
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

    broadcast('chat_update', messages);
  } catch (error) {
    console.error('Auto-refresh error:', error.message);
  }
}, 25000);

// REST API Routes
app.get('/api/chat', async (req, res) => {
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
          timestamp: timestamp
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

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-message', messageLimiter, express.json(), async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Invalid message' });
  }

  let sanitizedMessage = validator.trim(message);
  sanitizedMessage = validator.escape(sanitizedMessage);

  if (sanitizedMessage.length === 0) {
    return res.status(400).json({ error: 'Message is empty' });
  }

  if (sanitizedMessage.length > 1000) {
    return res.status(400).json({ error: `Message too long: ${sanitizedMessage.length}/1000` });
  }

  try {
    const messageToSend = validator.unescape(sanitizedMessage);
    await sendMessage(messageToSend);

    setTimeout(() => {
      const chatPromise = getChatFeed();
      chatPromise.then(feed => {
        broadcast('message_sent', { success: true });
      });
    }, 500);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/company-name', express.json(), async (req, res) => {
  const { user_id } = req.body;

  if (!Number.isInteger(user_id) || user_id <= 0) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (user_id > 999999999) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const companyName = await getCompanyName(user_id);
    res.json({ company_name: companyName });
  } catch (error) {
    res.status(500).json({ error: 'Could not load company name' });
  }
});

app.get('/api/alliance-members', async (req, res) => {
  try {
    const data = await apiCall('/alliance/get-alliance-members', 'POST', {});

    const members = data.data.members.map(member => ({
      user_id: member.user_id,
      company_name: member.company_name
    }));

    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

// HTTP Upgrade for WebSocket
const server = app.listen(PORT, async () => {
  await initializeAlliance();
  console.log(`\n🚀 Shipping Manager Chat Server running on http://localhost:${PORT}\n`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
