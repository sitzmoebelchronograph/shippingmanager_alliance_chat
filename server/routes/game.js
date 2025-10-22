// routes/game.js - Game Management Routes

const express = require('express');
const { apiCall } = require('../utils/api');

const router = express.Router();

/**
 * GET /api/vessel/get-vessels
 * Get vessels in harbor
 */
router.get('/vessel/get-vessels', async (req, res) => {
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

/**
 * GET /api/bunker/get-prices
 * Get bunker prices (fuel and CO2)
 */
router.get('/bunker/get-prices', async (req, res) => {
  try {
    const data = await apiCall('/bunker/get-prices', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error getting bunker prices:', error);
    res.status(500).json({ error: 'Failed to retrieve bunker prices' });
  }
});

/**
 * POST /api/bunker/purchase-fuel
 * Purchase fuel
 */
router.post('/bunker/purchase-fuel', express.json(), async (req, res) => {
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

/**
 * POST /api/bunker/purchase-co2
 * Purchase CO2
 */
router.post('/bunker/purchase-co2', express.json(), async (req, res) => {
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

/**
 * POST /api/route/depart-all
 * Depart all vessels
 */
router.post('/route/depart-all', async (req, res) => {
  try {
    const data = await apiCall('/route/depart-all', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error departing vessels:', error);
    res.status(500).json({ error: 'Failed to depart vessels' });
  }
});

/**
 * POST /api/maintenance/get
 * Get maintenance cost for vessels
 */
router.post('/maintenance/get', express.json(), async (req, res) => {
  const { vessel_ids } = req.body;

  if (!vessel_ids) {
    return res.status(400).json({ error: 'Missing vessel_ids' });
  }

  try {
    const data = await apiCall('/maintenance/get', 'POST', { vessel_ids });
    res.json(data);
  } catch (error) {
    console.error('Error getting maintenance cost:', error);
    res.status(500).json({ error: 'Failed to get maintenance cost' });
  }
});

/**
 * POST /api/maintenance/do-wear-maintenance-bulk
 * Perform bulk wear maintenance on vessels
 */
router.post('/maintenance/do-wear-maintenance-bulk', express.json(), async (req, res) => {
  const { vessel_ids } = req.body;

  if (!vessel_ids) {
    return res.status(400).json({ error: 'Missing vessel_ids' });
  }

  try {
    const data = await apiCall('/maintenance/do-wear-maintenance-bulk', 'POST', { vessel_ids });
    res.json(data);
  } catch (error) {
    console.error('Error performing bulk maintenance:', error);
    res.status(500).json({ error: 'Failed to perform bulk maintenance' });
  }
});

/**
 * GET /api/marketing/get-campaigns
 * Get marketing campaigns status
 */
router.get('/marketing/get-campaigns', async (req, res) => {
  try {
    const data = await apiCall('/marketing-campaign/get-marketing', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error getting marketing campaigns:', error);
    res.status(500).json({ error: 'Failed to retrieve marketing campaigns' });
  }
});

/**
 * POST /api/marketing/activate-campaign
 * Activate a marketing campaign
 */
router.post('/marketing/activate-campaign', express.json(), async (req, res) => {
  const { campaign_id } = req.body;

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' });
  }

  try {
    const data = await apiCall('/marketing-campaign/activate-marketing-campaign', 'POST', { campaign_id });
    res.json(data);
  } catch (error) {
    console.error('Error activating campaign:', error);
    res.status(500).json({ error: 'Failed to activate campaign' });
  }
});

module.exports = router;
