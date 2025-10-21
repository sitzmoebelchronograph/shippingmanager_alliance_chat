// routes/messenger.js - Private Messaging Routes

const express = require('express');
const validator = require('validator');
const { apiCall, getUserId, getUserCompanyName } = require('../utils/api');
const { messageLimiter } = require('../middleware');

const router = express.Router();

/**
 * GET /api/contact/get-contacts
 * Get contact list
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
 * GET /api/messenger/get-chats
 * Get all messenger chats
 */
router.get('/messenger/get-chats', async (req, res) => {
  try {
    const data = await apiCall('/messenger/get-chats', 'POST', {});
    res.json({
      chats: data.data,
      own_user_id: getUserId(),
      own_company_name: getUserCompanyName()
    });
  } catch (error) {
    console.error('Failed to get chats:', error);
    res.status(500).json({ error: 'Failed to retrieve chats' });
  }
});

/**
 * POST /api/messenger/get-messages
 * Get messages for a specific chat
 */
router.post('/messenger/get-messages', express.json(), async (req, res) => {
  const { chat_id } = req.body;

  if (!chat_id) {
    return res.status(400).json({ error: 'Invalid chat ID' });
  }

  try {
    const data = await apiCall('/messenger/get-chat', 'POST', { chat_id });

    res.json({
      messages: data.data.chat.messages || [],
      user_id: getUserId()
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

/**
 * POST /api/messenger/send-private
 * Send private message
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

module.exports = router;
