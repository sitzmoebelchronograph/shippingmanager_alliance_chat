// utils/api.js - API Helper Functions

const axios = require('axios');
const https = require('https');
const config = require('../config');

// State management
let ALLIANCE_ID = null;
let USER_ID = null;
let USER_COMPANY_NAME = null;
const userNameCache = new Map();

// Create HTTPS agent with Keep-Alive for connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,                // Enable Keep-Alive
  keepAliveMsecs: 30000,          // Keep connections alive for 30 seconds
  maxSockets: 10,                 // Max 10 simultaneous connections (good for anti-detection)
  maxFreeSockets: 5,              // Max 5 idle sockets
  timeout: 30000,                 // Socket timeout 30s
  scheduling: 'lifo'              // Use most recently used socket first
});

/**
 * Make API calls with authentication and Keep-Alive
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
 * Get company name from cache or API
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
 * Load alliance ID and User ID on startup
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
 * Get chat feed
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
 * Getters for state
 */
function getAllianceId() {
  return ALLIANCE_ID;
}

function getUserId() {
  return USER_ID;
}

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
