// routes/alliance.js - Alliance Chat Routes

const express = require('express');
const validator = require('validator');
const { apiCall, getCompanyName, getChatFeed, getAllianceId } = require('../utils/api');
const { messageLimiter } = require('../middleware');

const router = express.Router();

/**
 * GET /api/chat
 * Get alliance chat feed
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
 * POST /api/send-message
 * Send alliance message
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
 * POST /api/company-name
 * Get company name by user ID
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
 * GET /api/alliance-members
 * Get alliance members list
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
