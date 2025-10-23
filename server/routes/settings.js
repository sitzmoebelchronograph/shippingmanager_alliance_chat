/**
 * @fileoverview Persistent Settings Storage and Management Routes
 *
 * This module handles persistent application settings including price alert thresholds,
 * automation toggles, and notification preferences. Settings are stored in a JSON file
 * and synchronized across all connected WebSocket clients in real-time.
 *
 * Key Features:
 * - Persistent storage in settings.json (survives server restarts)
 * - Default settings fallback when file missing or corrupted
 * - Input validation and type coercion for all settings
 * - Real-time synchronization via WebSocket broadcast
 * - Graceful error handling with sensible defaults
 *
 * Why This Module:
 * - Centralizes user preferences and automation configuration
 * - Enables price alerts and auto-rebuy features
 * - Provides consistent settings across multiple client tabs
 * - Persists user choices between sessions
 * - Allows dynamic reconfiguration without server restart
 *
 * Settings Categories:
 * 1. Alert Thresholds:
 *    - fuelThreshold: Price alert for fuel ($/ton)
 *    - co2Threshold: Price alert for CO2 ($/ton)
 *    - maintenanceThreshold: Vessel condition alert (%)
 *
 * 2. Auto-Rebuy Settings:
 *    - autoRebuyFuel: Enable automatic fuel purchasing
 *    - autoRebuyFuelUseAlert: Use alert threshold (or custom threshold)
 *    - autoRebuyFuelThreshold: Custom fuel purchase threshold
 *    - autoRebuyCO2: Enable automatic CO2 purchasing
 *    - autoRebuyCO2UseAlert: Use alert threshold (or custom threshold)
 *    - autoRebuyCO2Threshold: Custom CO2 purchase threshold
 *
 * 3. Automation Toggles:
 *    - autoDepartAll: Auto-depart all vessels when ready
 *    - autoBulkRepair: Auto-repair all vessels below threshold
 *    - autoCampaignRenewal: Auto-renew marketing campaigns
 *    - autoPilotNotifications: Enable browser notifications for automation
 *
 * 4. Intelligent Auto-Depart Settings:
 *    - autoDepartUseRouteDefaults: Use route defaults vs custom values (default true)
 *    - minVesselUtilization: Minimum vessel capacity utilization % (default 45%)
 *    - autoVesselSpeed: Vessel speed as % of max_speed (default 50%)
 *
 * Default Values:
 * - Fuel alert: $400/ton (industry competitive price)
 * - CO2 alert: $7/ton (low market price)
 * - Maintenance alert: 10% vessel condition
 * - All automation: Disabled by default (user opt-in required)
 * - Vessel utilization: 45% minimum (prevents unprofitable trips)
 * - Vessel speed: 50% of max_speed (fuel cost optimization)
 * - Auto-depart: Use route defaults enabled (respects per-route settings)
 *
 * Synchronization:
 * - Settings changes broadcast to all connected WebSocket clients
 * - Message type: 'settings_update' with full settings object
 * - Ensures consistent UI state across all open tabs/devices
 *
 * @requires express - Router and middleware
 * @requires fs/promises - Async file system operations
 * @requires path - Path resolution for settings.json
 * @requires ../websocket - WebSocket broadcast function
 * @module server/routes/settings
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { broadcast } = require('../websocket');

/**
 * Path to persistent settings storage file.
 * Located in project root: settings.json
 *
 * @constant {string}
 */
const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

/**
 * GET /api/settings - Retrieves current application settings from persistent storage.
 *
 * This endpoint reads the settings.json file and returns the current configuration.
 * If the file doesn't exist or is corrupted (invalid JSON), it returns default settings
 * without creating the file (lazy initialization - file created on first POST).
 *
 * Why Graceful Fallback:
 * - First run: settings.json doesn't exist yet
 * - Corruption: Manual edits or disk errors may invalidate JSON
 * - Migration: Upgrading from older versions without settings file
 * - Never breaks UI: Always returns valid settings object
 *
 * Default Settings Philosophy:
 * - Conservative price thresholds ($400 fuel, $7 CO2)
 * - All automation disabled (requires explicit user opt-in)
 * - Safe defaults prevent accidental spending or API abuse
 *
 * Response Structure:
 * {
 *   // Alert thresholds
 *   fuelThreshold: 400,           // $/ton fuel price alert
 *   co2Threshold: 7,              // $/ton CO2 price alert
 *   maintenanceThreshold: 10,     // % vessel condition alert
 *
 *   // Auto-rebuy fuel settings
 *   autoRebuyFuel: false,         // Enable auto fuel purchasing
 *   autoRebuyFuelUseAlert: true,  // Use alert threshold (vs custom)
 *   autoRebuyFuelThreshold: 400,  // Custom threshold if not using alert
 *
 *   // Auto-rebuy CO2 settings
 *   autoRebuyCO2: false,          // Enable auto CO2 purchasing
 *   autoRebuyCO2UseAlert: true,   // Use alert threshold (vs custom)
 *   autoRebuyCO2Threshold: 7,     // Custom threshold if not using alert
 *
 *   // Automation features
 *   autoDepartAll: false,         // Auto-depart all vessels
 *   autoBulkRepair: false,        // Auto-repair vessels below threshold
 *   autoCampaignRenewal: false,   // Auto-renew marketing campaigns
 *   autoPilotNotifications: false,// Browser notifications for automation
 *
 *   // Intelligent auto-depart settings
 *   autoDepartUseRouteDefaults: true, // Use route defaults vs custom
 *   minVesselUtilization: 45,     // Minimum % capacity utilization
 *   autoVesselSpeed: 50           // % of max_speed (fuel optimization)
 * }
 *
 * Side Effects:
 * - Reads settings.json from disk
 * - Logs error to console if file missing/corrupted (doesn't throw)
 *
 * @name GET /api/settings
 * @function
 * @memberof module:server/routes/settings
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with settings object
 */
router.get('/settings', async (req, res) => {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    res.json(settings);
  } catch (error) {
    console.error('Error reading settings:', error);
    // Return default settings if file doesn't exist or is corrupted
    res.json({
      fuelThreshold: 400,
      co2Threshold: 7,
      maintenanceThreshold: 10,
      autoRebuyFuel: false,
      autoRebuyFuelUseAlert: true,
      autoRebuyFuelThreshold: 400,
      autoRebuyCO2: false,
      autoRebuyCO2UseAlert: true,
      autoRebuyCO2Threshold: 7,
      autoDepartAll: false,
      autoBulkRepair: false,
      autoRepairInterval: '2-3',
      autoCampaignRenewal: false,
      autoPilotNotifications: false,
      autoDepartUseRouteDefaults: true,
      minVesselUtilization: 45,
      autoVesselSpeed: 50
    });
  }
});

/**
 * POST /api/settings - Updates application settings and persists to disk.
 *
 * This endpoint receives settings from the frontend, validates and sanitizes the input,
 * writes the validated settings to settings.json, and broadcasts the update to all
 * connected WebSocket clients for real-time synchronization.
 *
 * Why Input Validation:
 * - Frontend can send malformed data (type errors, missing fields)
 * - Manual API calls may have incorrect types
 * - Ensures settings.json always contains valid data structure
 * - Prevents automation bugs from invalid threshold values
 *
 * Validation Strategy:
 * - Numeric thresholds: parseInt() with fallback defaults
 * - Boolean toggles: Double-negation coercion (!!)
 * - Optional booleans: undefined check before coercion
 * - All fields validated individually (no blind trust)
 *
 * Default Fallbacks:
 * - Invalid numbers default to conservative thresholds ($400 fuel, $7 CO2, 10% maint)
 * - autoRebuyFuelUseAlert defaults to true if undefined
 * - autoRebuyCO2UseAlert defaults to true if undefined
 * - Boolean toggles default to false if falsy
 *
 * Real-Time Synchronization:
 * - WebSocket broadcast: 'settings_update' message type
 * - All connected clients receive updated settings
 * - Frontend updates UI state immediately
 * - Multi-tab synchronization (change in one tab updates all tabs)
 *
 * Request Body:
 * {
 *   fuelThreshold: number,
 *   co2Threshold: number,
 *   maintenanceThreshold: number,
 *   autoRebuyFuel: boolean,
 *   autoRebuyFuelUseAlert: boolean,
 *   autoRebuyFuelThreshold: number,
 *   autoRebuyCO2: boolean,
 *   autoRebuyCO2UseAlert: boolean,
 *   autoRebuyCO2Threshold: number,
 *   autoDepartAll: boolean,
 *   autoBulkRepair: boolean,
 *   autoCampaignRenewal: boolean,
 *   autoPilotNotifications: boolean,
 *   autoDepartUseRouteDefaults: boolean,
 *   minVesselUtilization: number,
 *   autoVesselSpeed: number
 * }
 *
 * Response Format:
 * {
 *   success: true,
 *   settings: { ...validatedSettings }
 * }
 *
 * Side Effects:
 * - Writes settings.json to project root (overwrites existing file)
 * - Broadcasts settings_update to all WebSocket clients
 * - Triggers frontend settings update in all connected tabs
 *
 * @name POST /api/settings
 * @function
 * @memberof module:server/routes/settings
 * @param {express.Request} req - Express request object with settings in body
 * @param {express.Response} res - Express response object
 * @returns {Promise<void>} Sends JSON response with success status and validated settings
 */
router.post('/settings', async (req, res) => {
  try {
    const settings = req.body;

    // Validate settings structure
    const validSettings = {
      fuelThreshold: parseInt(settings.fuelThreshold) || 400,
      co2Threshold: parseInt(settings.co2Threshold) || 7,
      maintenanceThreshold: parseInt(settings.maintenanceThreshold) || 10,
      autoRebuyFuel: !!settings.autoRebuyFuel,
      autoRebuyFuelUseAlert: settings.autoRebuyFuelUseAlert !== undefined ? !!settings.autoRebuyFuelUseAlert : true,
      autoRebuyFuelThreshold: parseInt(settings.autoRebuyFuelThreshold) || 400,
      autoRebuyCO2: !!settings.autoRebuyCO2,
      autoRebuyCO2UseAlert: settings.autoRebuyCO2UseAlert !== undefined ? !!settings.autoRebuyCO2UseAlert : true,
      autoRebuyCO2Threshold: parseInt(settings.autoRebuyCO2Threshold) || 7,
      autoDepartAll: !!settings.autoDepartAll,
      autoBulkRepair: !!settings.autoBulkRepair,
      autoRepairInterval: settings.autoRepairInterval || '2-3',
      autoCampaignRenewal: !!settings.autoCampaignRenewal,
      autoPilotNotifications: !!settings.autoPilotNotifications,
      autoDepartUseRouteDefaults: settings.autoDepartUseRouteDefaults !== undefined ? !!settings.autoDepartUseRouteDefaults : true,
      minVesselUtilization: parseInt(settings.minVesselUtilization) || 45,
      autoVesselSpeed: parseInt(settings.autoVesselSpeed) || 50
    };

    await fs.writeFile(SETTINGS_FILE, JSON.stringify(validSettings, null, 2), 'utf8');

    // Broadcast settings update to all connected clients
    broadcast('settings_update', validSettings);

    // Restart backend automation if repair settings changed
    if (settings.autoBulkRepair !== undefined || settings.autoRepairInterval !== undefined) {
      try {
        const backendAutomation = require('../automation');
        backendAutomation.restartAutoRepair();
      } catch (error) {
        console.error('[Settings] Failed to restart backend automation:', error);
      }
    }

    res.json({ success: true, settings: validSettings });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
