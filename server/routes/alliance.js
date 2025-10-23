/**
 * @fileoverview Alliance Chat API Routes
 *
 * This module defines HTTP endpoints for alliance chat functionality, including
 * fetching the chat feed, sending messages, and retrieving alliance member information.
 * It acts as a proxy between the frontend and the Shipping Manager game API.
 *
 * Key Features:
 * - Chat feed retrieval with message transformation (API format → client format)
 * - Message sending with validation and rate limiting
 * - Company name lookup by user ID (used for chat rendering)
 * - Alliance member list retrieval
 * - Graceful handling of users not in alliance (no_alliance flag)
 *
 * Why This Exists:
 * - Centralizes alliance-related endpoints
 * - Abstracts game API details from frontend
 * - Provides input validation and sanitization
 * - Implements rate limiting on message sending
 * - Transforms timestamps and enriches data with company names
 *
 * Security Considerations:
 * - Message length validation (0-1000 characters)
 * - Input sanitization via validator.trim() and validator.unescape()
 * - Rate limiting: 30 messages per minute (messageLimiter)
 * - User ID validation (must be positive integer)
 * - Authentication inherited from apiCall() session cookie
 *
 * No Alliance Handling:
 * - All endpoints check getAllianceId() before proceeding
 * - Returns appropriate response when user not in alliance
 * - Prevents 404 errors from game API alliance endpoints
 *
 * @requires express - Router and middleware
 * @requires validator - Input validation and sanitization
 * @requires ../utils/api - API helper functions (apiCall, getCompanyName, etc.)
 * @requires ../middleware - Rate limiting middleware
 * @module server/routes/alliance
 */

const express = require('express');
const validator = require('validator');
const { apiCall, getCompanyName, getChatFeed, getAllianceId } = require('../utils/api');
const { messageLimiter } = require('../middleware');

const router = express.Router();

/**
 * GET /api/chat - Retrieves alliance chat feed with enriched message data.
 *
 * This endpoint fetches the alliance chat feed from the game API, transforms
 * the raw feed data into a client-friendly format with company names and
 * formatted timestamps, and returns it as JSON.
 *
 * Why This Transformation:
 * - API returns user_id, but frontend needs company name for display
 * - Timestamps converted from Unix epoch to UTC string for readability
 * - Separates 'chat' messages from 'feed' events for different UI rendering
 * - Company names cached to reduce API calls
 *
 * Message Types:
 * 1. Chat Messages (type: 'chat')
 *    - Fetches company name via getCompanyName() (cached)
 *    - Includes message text and user_id
 * 2. Feed Events (type: 'feed')
 *    - Alliance joins, route completions, etc.
 *    - Company name already in replacements object
 *
 * No Alliance Response:
 * - Returns { no_alliance: true, messages: [] } when user not in alliance
 * - Frontend can detect this and hide alliance features
 *
 * Response Format:
 * [
 *   {
 *     type: 'chat',
 *     company: 'ABC Shipping',
 *     message: 'Hello!',
 *     timestamp: 'Mon, 23 Oct 2025 14:30:00 GMT',
 *     user_id: 12345
 *   },
 *   {
 *     type: 'feed',
 *     feedType: 'alliance_member_joined',
 *     company: 'XYZ Corp',
 *     timestamp: 'Mon, 23 Oct 2025 14:25:00 GMT'
 *   }
 * ]
 *
 * Side Effects:
 * - Makes API call to /alliance/get-chat-feed
 * - May make multiple API calls to /user/get-company for uncached names
 *
 * @name GET /api/chat
 * @function
 * @memberof module:server/routes/alliance
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with messages array
 */
router.get('/chat', async (req, res) => {
  if (!getAllianceId()) {
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

/**
 * POST /api/send-message - Sends a message to alliance chat with validation and rate limiting.
 *
 * This endpoint receives a chat message from the frontend, validates and sanitizes it,
 * then forwards it to the game API. It's the primary workaround for the in-game chat bug
 * that causes page reloads with certain characters.
 *
 * Why This Endpoint:
 * - Bypasses in-game chat interface that has character bugs
 * - Provides input validation before hitting game API
 * - Sanitizes input to prevent XSS or injection attacks
 * - Rate limits to prevent spam (30 messages/minute)
 *
 * Validation Rules:
 * - Message must be string type
 * - Length: 1-1000 characters (game API limit)
 * - Trimmed of leading/trailing whitespace
 * - HTML entities unescaped (validator.unescape)
 *
 * Rate Limiting:
 * - Applied via messageLimiter middleware
 * - Limit: 30 requests per minute per IP
 * - Returns 429 Too Many Requests when exceeded
 * - Prevents spam and reduces ToS violation risk
 *
 * Sanitization:
 * - validator.trim() - Removes leading/trailing whitespace
 * - validator.unescape() - Converts HTML entities to characters
 * - Prevents empty messages after trimming
 *
 * No Alliance Handling:
 * - Returns 400 error if user not in alliance
 * - Prevents API call to /alliance/post-chat with null alliance_id
 *
 * Side Effects:
 * - Makes API call to /alliance/post-chat
 * - Message appears in alliance chat feed immediately
 * - WebSocket broadcast will include this message in next refresh cycle
 *
 * @name POST /api/send-message
 * @function
 * @memberof module:server/routes/alliance
 * @param {express.Request} req - Express request object with { message: string } body
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response { success: true } or error
 */
router.post('/send-message', messageLimiter, express.json(), async (req, res) => {
  if (!getAllianceId()) {
    return res.status(400).json({ error: 'You are not in an alliance' });
  }

  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.length === 0 || message.length > 1000) {
    return res.status(400).json({ error: 'Invalid message length or content' });
  }

  const sanitizedMessage = validator.trim(message);

  try {
    await apiCall('/alliance/post-chat', 'POST', {
      alliance_id: getAllianceId(),
      text: validator.unescape(sanitizedMessage)
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/company-name - Retrieves company name for a given user ID.
 *
 * This endpoint looks up a company name by user ID, leveraging the cached
 * getCompanyName() function to minimize API calls. Used by frontend for
 * displaying company names in various UI contexts.
 *
 * Why This Endpoint:
 * - Centralizes company name lookups
 * - Leverages server-side cache (reduces API calls)
 * - Provides fallback for failed lookups
 * - Validates user_id to prevent invalid API calls
 *
 * Validation:
 * - user_id must be positive integer
 * - Returns 400 error for invalid user_id
 *
 * Caching:
 * - getCompanyName() uses Map-based cache
 * - Cache persists for server lifetime
 * - Significant performance improvement for repeated lookups
 *
 * Fallback:
 * - Returns "User {userId}" if lookup fails
 * - Never throws error to frontend
 *
 * Side Effects:
 * - May make API call to /user/get-company on cache miss
 * - Stores result in userNameCache
 *
 * @name POST /api/company-name
 * @function
 * @memberof module:server/routes/alliance
 * @param {express.Request} req - Express request object with { user_id: number } body
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response { company_name: string }
 */
router.post('/company-name', express.json(), async (req, res) => {
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

/**
 * GET /api/alliance-members - Retrieves list of all alliance members.
 *
 * This endpoint fetches the complete alliance member roster from the game API
 * and returns it as a simplified array of user_id and company_name pairs.
 *
 * Why This Endpoint:
 * - Provides member list for UI features (member directory, mentions, etc.)
 * - Simplifies game API response (returns only needed fields)
 * - Gracefully handles users not in alliance
 *
 * No Alliance Handling:
 * - Returns empty array [] when user not in alliance
 * - Prevents 404 errors from game API
 *
 * Response Format:
 * [
 *   { user_id: 12345, company_name: "ABC Shipping" },
 *   { user_id: 67890, company_name: "XYZ Corp" }
 * ]
 *
 * Side Effects:
 * - Makes API call to /alliance/get-alliance-members
 *
 * @name GET /api/alliance-members
 * @function
 * @memberof module:server/routes/alliance
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with members array
 */
router.get('/alliance-members', async (req, res) => {
  if (!getAllianceId()) {
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

module.exports = router;
