/**
 * @fileoverview Private Messaging API Routes
 *
 * This module handles all private messaging (DM) functionality between users in the game.
 * It provides endpoints for managing contacts, viewing conversation lists, sending messages,
 * and deleting chats. Acts as a proxy between the frontend and the Shipping Manager game API.
 *
 * Key Features:
 * - Contact list retrieval (both personal contacts and alliance members)
 * - Conversation list management (all active DM threads)
 * - Message history retrieval for specific conversations
 * - Private message sending with validation and rate limiting
 * - Chat deletion functionality
 *
 * Why This Module:
 * - Separates private messaging concerns from alliance chat
 * - Provides unified interface for contact management
 * - Adds input validation before forwarding to game API
 * - Includes user context (own_user_id, own_company_name) in responses
 * - Graceful error handling to prevent UI breakage
 *
 * Security Considerations:
 * - Message length validation (0-1000 characters)
 * - Subject line validation (required, non-empty)
 * - Target user ID validation (must be valid integer)
 * - Input sanitization via validator.trim() and validator.unescape()
 * - Rate limiting on message sending (30 messages/minute)
 *
 * Error Handling Philosophy:
 * - GET endpoints return empty arrays on error (prevents UI breaking)
 * - POST endpoints return 400/500 errors as appropriate
 * - Detailed error logging for debugging
 * - User context always included in successful responses
 *
 * @requires express - Router and middleware
 * @requires validator - Input validation and sanitization
 * @requires ../utils/api - API helper functions (apiCall, getUserId, etc.)
 * @requires ../middleware - Rate limiting middleware (messageLimiter)
 * @module server/routes/messenger
 */

const express = require('express');
const validator = require('validator');
const { apiCall, getUserId, getUserCompanyName } = require('../utils/api');
const { messageLimiter } = require('../middleware');

const router = express.Router();

/**
 * GET /api/contact/get-contacts - Retrieves user's contact list and alliance contacts.
 *
 * This endpoint fetches both personal contacts and alliance member contacts from the game API,
 * sorts them alphabetically by company name, and returns them with user context information.
 *
 * Why Sorting:
 * - Alphabetical sorting improves UX (easier to find contacts)
 * - Game API doesn't guarantee order
 * - Sorted on server to avoid redundant client-side sorting
 *
 * Response Structure:
 * {
 *   contacts: [...],              // Personal contacts
 *   alliance_contacts: [...],     // Alliance member contacts
 *   own_user_id: 12345,          // Current user's ID
 *   own_company_name: "ABC Corp" // Current user's company name
 * }
 *
 * User Context:
 * - own_user_id: Used to filter out self from contact lists
 * - own_company_name: Used for UI display
 *
 * Side Effects:
 * - Makes API call to /contact/get-contacts
 *
 * @name GET /api/contact/get-contacts
 * @function
 * @memberof module:server/routes/messenger
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with contacts and user context
 */
router.get('/contact/get-contacts', async (req, res) => {
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
      own_user_id: getUserId(),
      own_company_name: getUserCompanyName()
    });
  } catch (error) {
    console.error('Failed to get contacts:', error);
    res.status(500).json({ error: 'Failed to retrieve contacts' });
  }
});

/**
 * GET /api/messenger/get-chats - Retrieves list of all active conversation threads.
 *
 * This endpoint fetches all messenger conversations (DM threads) for the current user.
 * Each chat represents a conversation with another user, including unread status and
 * last message preview.
 *
 * Why Graceful Error Handling:
 * - Returns empty chats array instead of error on API failure
 * - Prevents messenger UI from breaking
 * - Still includes user context for UI initialization
 * - Logs error for debugging but doesn't crash frontend
 *
 * Response Structure:
 * {
 *   chats: [...],                 // Array of conversation objects
 *   own_user_id: 12345,          // Current user's ID
 *   own_company_name: "ABC Corp" // Current user's company name
 * }
 *
 * User Context:
 * - own_user_id: Used to determine message sender/recipient in UI
 * - own_company_name: Used for UI display
 *
 * Side Effects:
 * - Makes API call to /messenger/get-chats
 *
 * @name GET /api/messenger/get-chats
 * @function
 * @memberof module:server/routes/messenger
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with chats and user context
 */
router.get('/messenger/get-chats', async (req, res) => {
  try {
    const data = await apiCall('/messenger/get-chats', 'POST', {});

    // Handle case where data.data might be undefined or null
    const chats = data?.data || [];

    res.json({
      chats: chats,
      own_user_id: getUserId(),
      own_company_name: getUserCompanyName()
    });
  } catch (error) {
    console.error('Failed to get chats:', error.message, error.stack);

    // Return empty chats instead of error to prevent UI breaking
    res.json({
      chats: [],
      own_user_id: getUserId(),
      own_company_name: getUserCompanyName()
    });
  }
});

/**
 * POST /api/messenger/get-messages - Retrieves message history for a specific conversation.
 *
 * This endpoint fetches all messages within a specific chat thread, identified by chat_id.
 * Returns the complete message history with timestamps, sender information, and message content.
 *
 * Why Flexible Data Structure Handling:
 * - Game API response structure varies
 * - data.chat.messages or data.messages depending on endpoint version
 * - Optional chaining (?.) prevents errors from undefined paths
 *
 * Request Body:
 * {
 *   chat_id: number  // Required: ID of the conversation
 * }
 *
 * Response Structure:
 * {
 *   messages: [...],    // Array of message objects
 *   user_id: 12345     // Current user's ID
 * }
 *
 * User Context:
 * - user_id: Used to determine message direction (sent vs received)
 *
 * Validation:
 * - chat_id is required (400 error if missing)
 *
 * Side Effects:
 * - Makes API call to /messenger/get-chat
 *
 * @name POST /api/messenger/get-messages
 * @function
 * @memberof module:server/routes/messenger
 * @param {express.Request} req - Express request object with { chat_id: number } body
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with messages and user_id
 */
router.post('/messenger/get-messages', express.json(), async (req, res) => {
  const { chat_id } = req.body;

  if (!chat_id) {
    return res.status(400).json({ error: 'Invalid chat ID' });
  }

  try {
    const data = await apiCall('/messenger/get-chat', 'POST', { chat_id });

    const messages = data?.data?.chat?.messages || data?.data?.messages || [];

    res.json({
      messages: messages,
      user_id: getUserId()
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

/**
 * POST /api/messenger/send-private - Sends a private message to another user.
 *
 * This endpoint handles sending private messages (DMs) between users. It validates
 * the message content, subject line, and recipient, then forwards the message to
 * the game API. Rate limited to prevent spam.
 *
 * Why This Endpoint:
 * - Bypasses in-game messenger interface (may have bugs/limitations)
 * - Provides input validation before hitting game API
 * - Sanitizes input to prevent XSS or injection attacks
 * - Rate limits to prevent spam (30 messages/minute)
 *
 * Validation Rules:
 * - message: String, 1-1000 characters
 * - subject: String, non-empty (required)
 * - target_user_id: Positive integer (required)
 *
 * Sanitization:
 * - validator.trim() - Removes leading/trailing whitespace
 * - validator.unescape() - Converts HTML entities to characters
 *
 * Rate Limiting:
 * - Applied via messageLimiter middleware
 * - Limit: 30 requests per minute per IP
 * - Returns 429 Too Many Requests when exceeded
 *
 * Request Body:
 * {
 *   message: string,         // Message content (1-1000 chars)
 *   subject: string,         // Subject line (required)
 *   target_user_id: number   // Recipient's user ID
 * }
 *
 * Side Effects:
 * - Makes API call to /messenger/send-message
 * - Creates new conversation or adds to existing thread
 * - Recipient receives notification (handled by game)
 *
 * @name POST /api/messenger/send-private
 * @function
 * @memberof module:server/routes/messenger
 * @param {express.Request} req - Express request object with message data in body
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response { success: true } or error
 */
router.post('/messenger/send-private', messageLimiter, express.json(), async (req, res) => {
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

/**
 * POST /api/messenger/delete-chat - Deletes a conversation thread.
 *
 * This endpoint handles deletion of messenger conversations. Requires both chat_ids
 * (conversation IDs) and system_message_ids (system message IDs) as the game API
 * needs both to properly clean up all related data.
 *
 * Why Both ID Arrays Required:
 * - Game API separates chat messages from system messages
 * - Both must be deleted to fully remove conversation
 * - Prevents orphaned data in game database
 *
 * Request Body:
 * {
 *   chat_ids: number[],           // Array of chat/conversation IDs to delete
 *   system_message_ids: number[]  // Array of related system message IDs
 * }
 *
 * Validation:
 * - Both chat_ids and system_message_ids required (400 error if missing)
 * - Arrays can be empty but must be present
 *
 * Side Effects:
 * - Makes API call to /messenger/delete-chat
 * - Permanently removes conversation from messenger
 * - Cannot be undone (deletion is permanent)
 *
 * @name POST /api/messenger/delete-chat
 * @function
 * @memberof module:server/routes/messenger
 * @param {express.Request} req - Express request object with chat deletion data
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response { success: true, data: {...} }
 */
router.post('/messenger/delete-chat', express.json(), async (req, res) => {
  const { chat_ids, system_message_ids } = req.body;

  if (!chat_ids || !system_message_ids) {
    return res.status(400).json({ error: 'chat_ids and system_message_ids required' });
  }

  try {
    const data = await apiCall('/messenger/delete-chat', 'POST', {
      chat_ids,
      system_message_ids
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
