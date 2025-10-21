// allychat.js - Shipping Manager Alliance Chat Web App

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
const SESSION_COOKIE = process.env.SHIPPING_MANAGER_COOKIE || 'PROVIDE YOUR SHIPPING_MANAGER_COOKIE IN AN .env FILE';
let ALLIANCE_ID = null;
let USER_ID = null;
let USER_COMPANY_NAME = null;
const userNameCache = new Map();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws://localhost:12345", "https://shippingmanager.cc"]
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
    const errorMessage = error.response 
      ? `Request failed with status code ${error.response.status}` 
      : error.message;
    console.error(`API Error: ${endpoint} ${errorMessage}`);
    throw new Error(errorMessage);
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

// Load alliance ID and User ID on startup
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

// Get chat feed
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
  if (!ALLIANCE_ID) {
    return; // Skip if user has no alliance
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
}, 25000);

// --- REST API Routes ---

// Get alliance chat
app.get('/api/chat', async (req, res) => {
  if (!ALLIANCE_ID) {
    return res.json({ no_alliance: true, messages: [] });
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

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send alliance message
app.post('/api/send-message', messageLimiter, express.json(), async (req, res) => {
  if (!ALLIANCE_ID) {
    return res.status(400).json({ error: 'You are not in an alliance' });
  }

  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.length === 0 || message.length > 1000) {
    return res.status(400).json({ error: 'Invalid message length or content' });
  }

  const sanitizedMessage = validator.trim(message);

  try {
    await apiCall('/alliance/post-chat', 'POST', {
      alliance_id: ALLIANCE_ID,
      text: validator.unescape(sanitizedMessage)
    });
    
    setTimeout(() => {
      broadcast('message_sent', { success: true });
    }, 500);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get company name
app.post('/api/company-name', express.json(), async (req, res) => {
  const { user_id } = req.body;
  if (!Number.isInteger(user_id) || user_id <= 0) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const companyName = await getCompanyName(user_id);
    res.json({ company_name: companyName });
  } catch (error) {
    res.status(500).json({ error: 'Could not load company name' });
  }
});

// Get alliance members
app.get('/api/alliance-members', async (req, res) => {
  if (!ALLIANCE_ID) {
    return res.json([]);
  }

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

// --- CONTACT LIST ENDPOINT ---

// Get contact list
app.get('/api/contact/get-contacts', async (req, res) => {
  try {
    const data = await apiCall('/contact/get-contacts', 'POST', {});

    const contacts = (data.data.contacts || []).sort((a, b) =>
      (a.company_name || '').localeCompare(b.company_name || '')
    );

    const allianceContacts = (data.data.alliance_contacts || []).sort((a, b) =>
      (a.company_name || '').localeCompare(b.company_name || '')
    );

    res.json({
      contacts: contacts,
      alliance_contacts: allianceContacts,
      own_user_id: USER_ID,
      own_company_name: USER_COMPANY_NAME
    });
  } catch (error) {
    console.error('Failed to get contacts:', error);
    res.status(500).json({ error: 'Failed to retrieve contacts' });
  }
});

// --- PRIVATE MESSENGER ENDPOINTS ---

// Get all messenger chats
app.get('/api/messenger/get-chats', async (req, res) => {
  try {
    const data = await apiCall('/messenger/get-chats', 'POST', {});
    res.json({
      chats: data.data,
      own_user_id: USER_ID,
      own_company_name: USER_COMPANY_NAME
    });
  } catch (error) {
    console.error('Failed to get chats:', error);
    res.status(500).json({ error: 'Failed to retrieve chats' });
  }
});

// Get messages for a specific chat
app.post('/api/messenger/get-messages', express.json(), async (req, res) => {
  const { chat_id } = req.body;

  if (!chat_id) {
    return res.status(400).json({ error: 'Invalid chat ID' });
  }

  try {
    const data = await apiCall('/messenger/get-chat', 'POST', { chat_id });

    res.json({
      messages: data.data.chat.messages || [],
      user_id: USER_ID
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

// Get vessels in harbor
app.get('/api/vessel/get-vessels', async (req, res) => {
  try {
    const data = await apiCall('/game/index', 'POST', {});
    res.json({
      vessels: data.data.user_vessels || []
    });
  } catch (error) {
    console.error('Error getting vessels:', error);
    res.status(500).json({ error: 'Failed to retrieve vessels' });
  }
});

// Get bunker prices
app.get('/api/bunker/get-prices', async (req, res) => {
  try {
    const data = await apiCall('/bunker/get-prices', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error getting bunker prices:', error);
    res.status(500).json({ error: 'Failed to retrieve bunker prices' });
  }
});

// Purchase fuel
app.post('/api/bunker/purchase-fuel', express.json(), async (req, res) => {
  const { amount } = req.body;

  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const data = await apiCall('/bunker/purchase-fuel', 'POST', { amount });
    res.json(data);
  } catch (error) {
    console.error('Error purchasing fuel:', error);
    res.status(500).json({ error: 'Failed to purchase fuel' });
  }
});

// Purchase CO2
app.post('/api/bunker/purchase-co2', express.json(), async (req, res) => {
  const { amount } = req.body;

  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const data = await apiCall('/bunker/purchase-co2', 'POST', { amount });
    res.json(data);
  } catch (error) {
    console.error('Error purchasing CO2:', error);
    res.status(500).json({ error: 'Failed to purchase CO2' });
  }
});

// Depart all vessels
app.post('/api/route/depart-all', async (req, res) => {
  try {
    const data = await apiCall('/route/depart-all', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error departing vessels:', error);
    res.status(500).json({ error: 'Failed to depart vessels' });
  }
});

// Send private message
app.post('/api/messenger/send-private', messageLimiter, express.json(), async (req, res) => {
  const { message, subject, target_user_id } = req.body;

  if (!message || typeof message !== 'string' || message.length === 0 || message.length > 1000) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  if (!subject || typeof subject !== 'string' || subject.length === 0) {
    return res.status(400).json({ error: 'Subject is required' });
  }

  if (!target_user_id || !Number.isInteger(target_user_id)) {
    return res.status(400).json({ error: 'Valid target_user_id required' });
  }

  const sanitizedMessage = validator.trim(message);
  const sanitizedSubject = validator.trim(subject);

  try {
    await apiCall('/messenger/send-message', 'POST', {
      subject: validator.unescape(sanitizedSubject),
      body: validator.unescape(sanitizedMessage),
      recipient: target_user_id
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending private message:', error);
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