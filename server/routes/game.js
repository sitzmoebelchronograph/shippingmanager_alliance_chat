/**
 * @fileoverview Game Management API Routes
 *
 * This module provides HTTP endpoints for managing game resources including vessels,
 * fuel/CO2 purchases, user settings, vessel maintenance, marketing campaigns, and
 * vessel acquisitions. These endpoints proxy requests to the Shipping Manager game API
 * while adding validation and error handling.
 *
 * Key Features:
 * - Vessel management (list vessels in harbor, purchase new vessels, bulk repairs)
 * - Bunker operations (fuel and CO2 price monitoring and purchasing)
 * - Route management (depart all vessels at once)
 * - Marketing campaigns (view available campaigns, activate/renew)
 * - User settings retrieval (anchor points, company data)
 *
 * Why This Module:
 * - Consolidates all game resource management endpoints
 * - Provides validation before forwarding to game API
 * - Standardizes error responses across all game operations
 * - Enables automation features (auto-rebuy, auto-depart, auto-repair)
 *
 * Common Patterns:
 * - GET endpoints retrieve current state (prices, vessels, settings)
 * - POST endpoints perform actions (purchase, depart, repair)
 * - All endpoints include error handling with descriptive messages
 * - Graceful degradation (empty arrays instead of errors for UI-critical endpoints)
 *
 * @requires express - Router and middleware
 * @requires ../utils/api - API helper function (apiCall)
 * @module server/routes/game
 */

const express = require('express');
const { apiCall } = require('../utils/api');

const router = express.Router();

/** GET /api/vessel/get-vessels - Retrieves all vessels currently in harbor. Uses /game/index endpoint to get complete vessel list with status, cargo, maintenance needs, etc. */
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

/** GET /api/user/get-settings - Retrieves user settings including anchor points (used for auto-rebuy calculations). */
router.get('/user/get-settings', async (req, res) => {
  try {
    const data = await apiCall('/user/get-user-settings', 'GET', {});
    res.json(data);
  } catch (error) {
    console.error('Error getting user settings:', error);
    res.status(500).json({ error: 'Failed to retrieve user settings' });
  }
});

/** GET /api/bunker/get-prices - Fetches current market prices for fuel and CO2. Critical for price alerts and auto-rebuy features. */
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
 * POST /api/bunker/purchase-fuel - Purchases specified amount of fuel.
 * Validation: amount must be positive integer. Used by manual purchases and auto-rebuy automation.
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
 * POST /api/bunker/purchase-co2 - Purchases specified amount of CO2 certificates.
 * Validation: amount must be positive integer. Used by manual purchases and auto-rebuy automation.
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

/** POST /api/route/depart-all - Departs all vessels in harbor on their assigned routes. Used by automation features. */
router.post('/route/depart-all', async (req, res) => {
  try {
    const data = await apiCall('/route/depart-all', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error departing vessels:', error);
    res.status(500).json({ error: 'Failed to depart vessels' });
  }
});

/** POST /api/maintenance/get - Calculates maintenance cost for specified vessels. Returns total repair cost and individual vessel costs. */
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

/** POST /api/maintenance/do-wear-maintenance-bulk - Performs bulk wear maintenance on multiple vessels. Repairs all specified vessels in a single API call. */
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
 * GET /api/marketing/get-campaigns - Retrieves available marketing campaigns and active campaign status.
 * Graceful error handling: Returns empty arrays instead of error to prevent UI breaking.
 */
router.get('/marketing/get-campaigns', async (req, res) => {
  try {
    const data = await apiCall('/marketing-campaign/get-marketing', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error getting marketing campaigns:', error.message, error.stack);

    // Return empty campaigns instead of error to prevent UI breaking
    res.json({
      data: {
        marketing_campaigns: [],
        active_campaigns: []
      },
      user: {
        reputation: 0
      }
    });
  }
});

/** POST /api/marketing/activate-campaign - Activates a marketing campaign by campaign_id. Used for manual activation and auto-renewal automation. */
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

/** GET /api/vessel/get-all-acquirable - Fetches all vessels available for purchase from the marketplace. */
router.get('/vessel/get-all-acquirable', async (req, res) => {
  try {
    const data = await apiCall('/vessel/get-all-acquirable-vessels', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error getting acquirable vessels:', error);
    res.status(500).json({ error: 'Failed to retrieve acquirable vessels' });
  }
});

/**
 * POST /api/vessel/purchase-vessel - Purchases a new vessel with specified configuration.
 * Default configuration: 4-blade propeller, optional antifouling, no enhanced deck beams.
 * Validation: vessel_id and name are required fields.
 */
router.post('/vessel/purchase-vessel', express.json(), async (req, res) => {
  const { vessel_id, name, antifouling_model } = req.body;

  if (!vessel_id || !name) {
    return res.status(400).json({ error: 'Missing required fields: vessel_id, name' });
  }

  try {
    const data = await apiCall('/vessel/purchase-vessel', 'POST', {
      vessel_id,
      name,
      adjust_speed: '4_blade_propeller',
      antifouling_model: antifouling_model || null,
      enhanced_deck_beams: 0
    });
    res.json(data);
  } catch (error) {
    console.error('Error purchasing vessel:', error);
    res.status(500).json({ error: 'Failed to purchase vessel' });
  }
});

module.exports = router;
