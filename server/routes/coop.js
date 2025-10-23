/**
 * @fileoverview Alliance Cooperation Routes
 *
 * Handles cooperation/coop vessel management within alliances.
 * Provides endpoints for viewing coop stats and member information.
 *
 * @module server/routes/coop
 * @requires express
 * @requires ../utils/api
 */

const express = require('express');
const router = express.Router();
const { apiCall } = require('../utils/api');

/**
 * GET /api/coop/data - Retrieves alliance cooperation data
 *
 * Fetches coop statistics including:
 * - Available coop slots (how many more vessels can be sent)
 * - Cap (maximum coop vessels per season)
 * - Sent/received this season
 * - Historical sent/received totals
 * - Member coop data (enabled status, fuel, vessels, etc.)
 *
 * Response Structure:
 * {
 *   data: {
 *     coop: {
 *       available: number,           // Coop slots remaining
 *       cap: number,                 // Maximum coop vessels per season
 *       sent_this_season: number,    // Vessels sent this season
 *       received_this_season: number,// Vessels received this season
 *       sent_historical: number,     // Total vessels sent historically
 *       received_historical: number  // Total vessels received historically
 *     },
 *     members_coop: [{
 *       user_id: number,
 *       enabled: boolean,            // Whether coop is enabled for this member
 *       sent_this_season: number,
 *       sent_last_season: number,
 *       received_this_season: number,
 *       sent_historical: number,
 *       received_historical: number,
 *       total_vessels: number,
 *       fuel: number,
 *       donations_this_season: number,
 *       donations_historical: number,
 *       has_real_purchase: boolean
 *     }]
 *   }
 * }
 *
 * @name GET /api/coop/data
 * @function
 * @memberof module:server/routes/coop
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with coop data
 */
router.get('/coop/data', async (req, res) => {
  try {
    const data = await apiCall('/coop/get-coop-data', 'POST', {});
    res.json(data);
  } catch (error) {
    console.error('Error fetching coop data:', error);
    res.status(500).json({ error: 'Failed to fetch coop data' });
  }
});

module.exports = router;
