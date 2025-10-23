/**
 * @fileoverview AutoPilot Automation System for Shipping Manager
 *
 * Provides intelligent automation features with anti-detection mechanisms:
 *
 * **Features:**
 * 1. **Auto-Rebuy Fuel** - Monitors fuel prices and automatically purchases when at/below threshold
 * 2. **Auto-Rebuy CO2** - Monitors CO2 prices and automatically purchases when at/below threshold
 * 3. **Auto-Depart All** - Continuously departs all vessels in port when fuel is available
 * 4. **Auto Bulk Repair** - Repairs all vessels with wear > 0 when affordable
 * 5. **Auto Campaign Renewal** - Renews expired campaigns (reputation, awareness, green)
 *
 * **Auto-Rebuy Strategy:**
 * Simple price-driven logic - whenever price is at or below the configured threshold,
 * the system attempts to purchase. Continues buying every 30-35 seconds (when prices
 * update) until bunker is full or funds are depleted. No time windows - purely price-based.
 *
 * **Rate Limiting & Anti-Detection:**
 * - Fuel/CO2 rebuy: Event-driven (triggered by price updates every 30-35s)
 * - Auto-depart checks: Random 1-2 minute intervals
 * - Auto-repair checks: Random 1-2 minute intervals
 * - Campaign renewal checks: Random 2-3 minute intervals
 * - Global automation loop: Random 1-3 minute intervals
 *
 * **Event-Driven Architecture:**
 * Bunker price updates from bunker-management.js trigger rebuy checks via
 * triggerAutoRebuyChecks(). This ensures fuel/CO2 purchases happen immediately
 * when prices drop, without constant API polling.
 *
 * @module automation
 * @requires api - purchaseFuel, purchaseCO2, departAllVessels, fetchVessels, getMaintenanceCost, doWearMaintenanceBulk, fetchCampaigns, activateCampaign
 * @requires utils - showFeedback, formatNumber, showNotification
 * @requires bunker-management - getCurrentBunkerState
 */

import { purchaseFuel, purchaseCO2, departAllVessels, fetchVessels, getMaintenanceCost, doWearMaintenanceBulk, fetchCampaigns, activateCampaign } from './api.js';
import { showFeedback, formatNumber, showNotification } from './utils.js';
import { getCurrentBunkerState } from './bunker-management.js';

/**
 * Sends feedback message to UI and optionally displays browser notification.
 * Notifications are only shown if autoPilotNotifications setting is enabled
 * and browser notification permission has been granted.
 *
 * HTML tags are automatically stripped from notification body text.
 *
 * @async
 * @param {string} message - Message to display (may contain HTML)
 * @param {string} [type='success'] - Feedback type ('success', 'error', 'info')
 * @returns {Promise<void>}
 */
async function sendAutoPilotFeedback(message, type = 'success') {
  const settings = window.getSettings ? window.getSettings() : {};

  showFeedback(message, type);

  if (settings.autoPilotNotifications && Notification.permission === 'granted') {
    // Strip HTML tags for notification
    const plainMessage = message.replace(/<[^>]*>/g, '');
    await showNotification('🤖 Auto-Pilot Action', {
      body: plainMessage,
      icon: '/favicon.ico',
      tag: 'auto-pilot',
      silent: false
    });
  }
}

// ============================================================================
// State Variables
// ============================================================================

/**
 * Prevents concurrent purchase operations to avoid race conditions.
 * Set to true while fuel/CO2 purchase is in progress.
 * @type {boolean}
 */
let isAutoBuying = false;

/**
 * Timestamp (Date.now()) of last vessel departure check.
 * Used to enforce random 1-2 minute intervals between checks.
 * @type {number}
 */
let lastVesselCheck = 0;

/**
 * Timestamp (Date.now()) of last bulk repair check.
 * Used to enforce random 1-2 minute intervals between checks.
 * @type {number}
 */
let lastRepairCheck = 0;

/**
 * Timestamp (Date.now()) of last campaign renewal check.
 * Used to enforce random 2-3 minute intervals between checks.
 * @type {number}
 */
let lastCampaignCheck = 0;

// ============================================================================
// Auto-Rebuy Fuel
// ============================================================================

/**
 * Checks if automatic fuel purchase should be triggered based on current price.
 * This function is called by bunker-management.js whenever prices update (every 30-35s).
 *
 * **Simple Logic:**
 * - Whenever price is at or below threshold, attempts to purchase fuel
 * - Continues purchasing every price update until bunker is full or funds depleted
 * - No time windows - purely price-driven
 *
 * **Threshold Selection:**
 * - Uses settings.fuelThreshold if autoRebuyFuelUseAlert is enabled
 * - Otherwise uses settings.autoRebuyFuelThreshold
 *
 * @async
 * @param {Object} settings - User settings object from window.getSettings()
 * @param {boolean} settings.autoRebuyFuel - Whether auto-rebuy is enabled
 * @param {boolean} settings.autoRebuyFuelUseAlert - Whether to use alert threshold
 * @param {number} settings.fuelThreshold - Alert threshold price ($/ton)
 * @param {number} settings.autoRebuyFuelThreshold - Auto-rebuy threshold price ($/ton)
 * @returns {Promise<void>}
 */
async function checkAutoRebuyFuel(settings) {
  if (!settings.autoRebuyFuel) return;
  if (isAutoBuying) return; // Prevent concurrent purchases

  try {
    const bunkerState = getCurrentBunkerState();
    const fuelPrice = bunkerState.fuelPrice;

    if (!fuelPrice) return;

    // Determine which threshold to use
    const threshold = settings.autoRebuyFuelUseAlert
      ? settings.fuelThreshold
      : settings.autoRebuyFuelThreshold;

    // If price is at or below threshold, try to buy
    if (fuelPrice <= threshold) {
      console.log(`[Auto-Rebuy] Fuel price ${fuelPrice} <= threshold ${threshold}, attempting purchase`);
      await performAutoRebuyFuel(bunkerState, fuelPrice);
    }
  } catch (error) {
    console.error('[Auto-Rebuy Fuel] Error:', error);
  }
}

/**
 * Executes automatic fuel purchase when price is favorable.
 * Calculates optimal purchase amount based on available bunker space and cash.
 *
 * **Purchase Logic:**
 * - Calculates available bunker space (maxFuel - currentFuel)
 * - Calculates maximum affordable amount (cash / fuelPrice)
 * - Purchases the lesser of available space or affordable amount
 * - Skips purchase if bunker full or insufficient funds
 *
 * **Side Effects:**
 * - Sets isAutoBuying lock during operation
 * - Triggers UI update via window.debouncedUpdateBunkerStatus()
 * - Sends notification if autoPilotNotifications enabled
 *
 * @async
 * @param {Object} bunkerState - Current bunker state from getCurrentBunkerState()
 * @param {number} bunkerState.currentFuel - Current fuel in bunker (tons)
 * @param {number} bunkerState.maxFuel - Maximum bunker capacity (tons)
 * @param {number} bunkerState.currentCash - Available cash ($)
 * @param {number} fuelPrice - Current fuel price ($/ton)
 * @returns {Promise<void>}
 */
async function performAutoRebuyFuel(bunkerState, fuelPrice) {
  isAutoBuying = true;

  try {
    // Use bunkerState which already has correct values
    const currentFuel = bunkerState.currentFuel;
    const maxFuel = bunkerState.maxFuel;
    const availableSpace = maxFuel - currentFuel;

    if (availableSpace <= 0) {
      console.log('[Auto-Rebuy Fuel] Bunker already full');
      isAutoBuying = false;
      return;
    }

    const cash = bunkerState.currentCash;
    const maxAffordable = Math.floor(cash / fuelPrice);
    const amountToBuy = Math.min(availableSpace, maxAffordable);

    if (amountToBuy <= 0) {
      console.log('[Auto-Rebuy Fuel] Not enough funds');
      isAutoBuying = false;
      return;
    }

    console.log(`[Auto-Rebuy Fuel] Buying ${amountToBuy.toFixed(2)} tons at $${fuelPrice}/ton`);

    const result = await purchaseFuel(amountToBuy);

    if (result.success || result.data) {
      await sendAutoPilotFeedback(`🔄 Auto-bought ${amountToBuy.toFixed(0)} tons of fuel at $${fuelPrice}/ton`, 'success');

      // Trigger UI update
      if (window.debouncedUpdateBunkerStatus) {
        window.debouncedUpdateBunkerStatus(500);
      }
    }
  } catch (error) {
    console.error('[Auto-Rebuy Fuel] Purchase failed:', error);
    await sendAutoPilotFeedback(`❌ Auto-rebuy fuel failed: ${error.message}`, 'error');
  } finally {
    isAutoBuying = false;
  }
}

// ============================================================================
// Auto-Rebuy CO2
// ============================================================================

/**
 * Checks if automatic CO2 purchase should be triggered based on current price.
 * This function is called by bunker-management.js whenever prices update (every 30-35s).
 *
 * **Simple Logic:**
 * - Whenever price is at or below threshold, attempts to purchase CO2
 * - Continues purchasing every price update until bunker is full or funds depleted
 * - No time windows - purely price-driven
 *
 * **Threshold Selection:**
 * - Uses settings.co2Threshold if autoRebuyCO2UseAlert is enabled
 * - Otherwise uses settings.autoRebuyCO2Threshold
 *
 * @async
 * @param {Object} settings - User settings object from window.getSettings()
 * @param {boolean} settings.autoRebuyCO2 - Whether auto-rebuy is enabled
 * @param {boolean} settings.autoRebuyCO2UseAlert - Whether to use alert threshold
 * @param {number} settings.co2Threshold - Alert threshold price ($/ton)
 * @param {number} settings.autoRebuyCO2Threshold - Auto-rebuy threshold price ($/ton)
 * @returns {Promise<void>}
 */
async function checkAutoRebuyCO2(settings) {
  if (!settings.autoRebuyCO2) return;
  if (isAutoBuying) return; // Prevent concurrent purchases

  try {
    const bunkerState = getCurrentBunkerState();
    const co2Price = bunkerState.co2Price;

    if (!co2Price) return;

    // Determine which threshold to use
    const threshold = settings.autoRebuyCO2UseAlert
      ? settings.co2Threshold
      : settings.autoRebuyCO2Threshold;

    // If price is at or below threshold, try to buy
    if (co2Price <= threshold) {
      console.log(`[Auto-Rebuy] CO2 price ${co2Price} <= threshold ${threshold}, attempting purchase`);
      await performAutoRebuyCO2(bunkerState, co2Price);
    }
  } catch (error) {
    console.error('[Auto-Rebuy CO2] Error:', error);
  }
}

/**
 * Executes automatic CO2 purchase when price is favorable.
 * Calculates optimal purchase amount based on available bunker space and cash.
 *
 * **Purchase Logic:**
 * - Calculates available bunker space (maxCO2 - currentCO2)
 * - Calculates maximum affordable amount (cash / co2Price)
 * - Purchases the lesser of available space or affordable amount
 * - Skips purchase if bunker full or insufficient funds
 *
 * **Side Effects:**
 * - Sets isAutoBuying lock during operation
 * - Triggers UI update via window.debouncedUpdateBunkerStatus()
 * - Sends notification if autoPilotNotifications enabled
 *
 * @async
 * @param {Object} bunkerState - Current bunker state from getCurrentBunkerState()
 * @param {number} bunkerState.currentCO2 - Current CO2 in bunker (tons)
 * @param {number} bunkerState.maxCO2 - Maximum bunker capacity (tons)
 * @param {number} bunkerState.currentCash - Available cash ($)
 * @param {number} co2Price - Current CO2 price ($/ton)
 * @returns {Promise<void>}
 */
async function performAutoRebuyCO2(bunkerState, co2Price) {
  isAutoBuying = true;

  try {
    // Use bunkerState which already has correct values
    const currentCO2 = bunkerState.currentCO2;
    const maxCO2 = bunkerState.maxCO2;
    const availableSpace = maxCO2 - currentCO2;

    if (availableSpace <= 0) {
      console.log('[Auto-Rebuy CO2] Bunker already full');
      isAutoBuying = false;
      return;
    }

    const cash = bunkerState.currentCash;
    const maxAffordable = Math.floor(cash / co2Price);
    const amountToBuy = Math.min(availableSpace, maxAffordable);

    if (amountToBuy <= 0) {
      console.log('[Auto-Rebuy CO2] Not enough funds');
      isAutoBuying = false;
      return;
    }

    console.log(`[Auto-Rebuy CO2] Buying ${amountToBuy.toFixed(2)} tons at $${co2Price}/ton`);

    const result = await purchaseCO2(amountToBuy);

    if (result.success || result.data) {
      await sendAutoPilotFeedback(`🔄 Auto-bought ${amountToBuy.toFixed(0)} tons of CO2 at $${co2Price}/ton`, 'success');

      // Trigger UI update
      if (window.debouncedUpdateBunkerStatus) {
        window.debouncedUpdateBunkerStatus(500);
      }
    }
  } catch (error) {
    console.error('[Auto-Rebuy CO2] Purchase failed:', error);
    await sendAutoPilotFeedback(`❌ Auto-rebuy CO2 failed: ${error.message}`, 'error');
  } finally {
    isAutoBuying = false;
  }
}

// ============================================================================
// Auto-Depart All Vessels
// ============================================================================

/**
 * Checks if vessels should be automatically departed and executes departure.
 * Runs in an endless loop with randomized intervals for anti-detection.
 *
 * **Throttling Strategy:**
 * - Randomized interval between 1-2 minutes between checks
 * - Uses lastVesselCheck timestamp to enforce minimum intervals
 * - Random timing prevents predictable patterns that could trigger anti-bot
 *
 * **Departure Logic:**
 * - Only departs vessels with status 'port' and not parked (is_parked = false)
 * - Requires fuel > 0 in bunker to proceed
 * - Skips if no vessels in port or no fuel available
 *
 * **Side Effects:**
 * - Triggers UI updates via window.debouncedUpdateVesselCount()
 * - Triggers UI updates via window.debouncedUpdateBunkerStatus()
 * - Sends notification if autoPilotNotifications enabled
 *
 * @async
 * @param {Object} settings - User settings object from window.getSettings()
 * @param {boolean} settings.autoDepartAll - Whether auto-depart is enabled
 * @returns {Promise<void>}
 */
async function checkAutoDepartAll(settings) {
  if (!settings.autoDepartAll) return;

  // Throttle checks - random between 1-2 minutes
  const now = Date.now();
  const minInterval = 60000; // 1 minute
  const maxInterval = 120000; // 2 minutes
  const randomInterval = minInterval + Math.random() * (maxInterval - minInterval);

  if (now - lastVesselCheck < randomInterval) return;
  lastVesselCheck = now;

  try {
    const vesselsData = await fetchVessels();
    const vesselsInPort = vesselsData.vessels.filter(v => v.status === 'port' && !v.is_parked);

    if (vesselsInPort.length === 0) return;

    // Check if we have fuel (use bunkerState which already has correct values)
    const bunkerState = getCurrentBunkerState();
    const currentFuel = bunkerState.currentFuel;

    if (currentFuel <= 0) {
      console.log('[Auto-Depart] No fuel available');
      return;
    }

    // Auto-depart vessels silently

    const result = await departAllVessels();

    if (result.success || result.data) {
      await sendAutoPilotFeedback(`🔄 Auto-departed ${vesselsInPort.length} vessel(s)`, 'success');

      // Trigger UI update
      if (window.debouncedUpdateVesselCount) {
        window.debouncedUpdateVesselCount(500);
      }
      if (window.debouncedUpdateBunkerStatus) {
        window.debouncedUpdateBunkerStatus(500);
      }
    }
  } catch (error) {
    console.error('[Auto-Depart] Error:', error);
  }
}

// ============================================================================
// Auto Bulk Repair
// ============================================================================

/**
 * Checks if vessels need repair and automatically repairs all vessels with wear > 0.
 * Runs with randomized intervals for anti-detection.
 *
 * **Throttling Strategy:**
 * - Randomized interval between 1-2 minutes between checks
 * - Uses lastRepairCheck timestamp to enforce minimum intervals
 * - Random timing prevents predictable patterns that could trigger anti-bot
 *
 * **Repair Logic:**
 * - Repairs ALL vessels with wear > 0 (any wear at all)
 * - Fetches maintenance cost for all vessels before repairing
 * - Only repairs if total cost <= current cash
 * - Skips if no vessels need repair or insufficient funds
 *
 * **Cost Calculation:**
 * - Calls getMaintenanceCost() to get accurate repair costs
 * - Extracts 'wear' type maintenance from maintenance_data
 * - Sums total cost across all vessels to repair
 *
 * **Side Effects:**
 * - Triggers UI updates via window.debouncedUpdateRepairCount()
 * - Triggers UI updates via window.debouncedUpdateBunkerStatus()
 * - Sends notification if autoPilotNotifications enabled
 *
 * @async
 * @param {Object} settings - User settings object from window.getSettings()
 * @param {boolean} settings.autoBulkRepair - Whether auto-repair is enabled
 * @returns {Promise<void>}
 */
async function checkAutoBulkRepair(settings) {
  if (!settings.autoBulkRepair) return;

  // Throttle checks - random between 1-2 minutes
  const now = Date.now();
  const minInterval = 60000; // 1 minute
  const maxInterval = 120000; // 2 minutes
  const randomInterval = minInterval + Math.random() * (maxInterval - minInterval);

  if (now - lastRepairCheck < randomInterval) return;
  lastRepairCheck = now;

  try {
    const vesselsData = await fetchVessels();
    const vessels = vesselsData.vessels || [];

    // Repair ALL vessels with any wear (wear > 0)
    const vesselsToRepair = vessels.filter(v => {
      const wear = parseInt(v.wear) || 0;
      return wear > 0;
    });

    if (vesselsToRepair.length === 0) return;

    const vesselIds = vesselsToRepair.map(v => v.id);
    const costData = await getMaintenanceCost(vesselIds);

    let totalCost = 0;
    if (costData.data?.vessels) {
      costData.data.vessels.forEach(vessel => {
        const wearMaintenance = vessel.maintenance_data?.find(m => m.type === 'wear');
        if (wearMaintenance) {
          totalCost += wearMaintenance.price || 0;
        }
      });
    }

    const bunkerState = getCurrentBunkerState();
    if (totalCost > bunkerState.currentCash) {
      console.log('[Auto-Repair] Not enough cash for repair');
      return;
    }

    // Perform repair
    const result = await doWearMaintenanceBulk(vesselIds);

    if (result.success || result.data) {
      await sendAutoPilotFeedback(`🔄 Auto-repaired ${vesselsToRepair.length} vessel(s) for $${formatNumber(totalCost)}`, 'success');

      // Trigger UI update
      if (window.debouncedUpdateRepairCount) {
        window.debouncedUpdateRepairCount(500);
      }
      if (window.debouncedUpdateBunkerStatus) {
        window.debouncedUpdateBunkerStatus(500);
      }
    }
  } catch (error) {
    console.error('[Auto-Repair] Error:', error);
  }
}

// ============================================================================
// Auto Campaign Renewal
// ============================================================================

/**
 * Checks if marketing campaigns need renewal and automatically activates
 * the most expensive affordable campaign for each inactive type.
 * Runs with randomized intervals for anti-detection.
 *
 * **Throttling Strategy:**
 * - Randomized interval between 2-3 minutes between checks
 * - Uses lastCampaignCheck timestamp to enforce minimum intervals
 * - Random timing prevents predictable patterns that could trigger anti-bot
 *
 * **Campaign Types:**
 * Monitors three campaign types: 'reputation', 'awareness', 'green'
 *
 * **Renewal Logic:**
 * - Checks which of the three campaign types are currently inactive
 * - For each inactive type, finds the most expensive campaign that can be afforded
 * - Activates campaigns sequentially, updating cash after each purchase
 * - Skips if all campaigns active or no affordable options
 *
 * **Best Campaign Selection:**
 * - Filters campaigns by type (reputation/awareness/green)
 * - Filters by affordability (price <= currentCash)
 * - Sorts by price descending to get most expensive
 * - Selects first (most expensive) affordable campaign
 *
 * **Side Effects:**
 * - Triggers UI updates via window.debouncedUpdateBunkerStatus()
 * - Sends notification if autoPilotNotifications enabled
 * - Updates local currentCash tracker after each purchase
 *
 * @async
 * @param {Object} settings - User settings object from window.getSettings()
 * @param {boolean} settings.autoCampaignRenewal - Whether auto-renewal is enabled
 * @returns {Promise<void>}
 */
async function checkAutoCampaignRenewal(settings) {
  if (!settings.autoCampaignRenewal) return;

  // Throttle checks - random between 2-3 minutes
  const now = Date.now();
  const minInterval = 120000; // 2 minutes
  const maxInterval = 180000; // 3 minutes
  const randomInterval = minInterval + Math.random() * (maxInterval - minInterval);

  if (now - lastCampaignCheck < randomInterval) return;
  lastCampaignCheck = now;

  try {
    const data = await fetchCampaigns();
    const allCampaigns = data.data.marketing_campaigns || [];
    const activeCampaigns = data.data.active_campaigns || [];
    const activeTypes = new Set(activeCampaigns.map(c => c.option_name));

    const requiredTypes = ['reputation', 'awareness', 'green'];
    const inactiveTypes = requiredTypes.filter(type => !activeTypes.has(type));

    if (inactiveTypes.length === 0) return; // All campaigns active

    const bunkerState = getCurrentBunkerState();
    let currentCash = bunkerState.currentCash;

    // For each inactive type, find the most expensive campaign we can afford
    for (const type of inactiveTypes) {
      const typeCampaigns = allCampaigns
        .filter(c => c.option_name === type)
        .filter(c => c.price <= currentCash)
        .sort((a, b) => b.price - a.price); // Sort by price descending

      if (typeCampaigns.length === 0) {
        console.log(`[Auto-Campaign] No affordable ${type} campaigns`);
        continue;
      }

      const bestCampaign = typeCampaigns[0];

      try {
        const result = await activateCampaign(bestCampaign.id);

        if (result.success || result.data) {
          const typeName = type.charAt(0).toUpperCase() + type.slice(1);
          await sendAutoPilotFeedback(`🔄 Auto-activated ${typeName} campaign for $${formatNumber(bestCampaign.price)}`, 'success');

          // Trigger UI update
          if (window.debouncedUpdateBunkerStatus) {
            window.debouncedUpdateBunkerStatus(500);
          }

          // Update current cash after purchase
          currentCash -= bestCampaign.price;
        }
      } catch (error) {
        console.error(`[Auto-Campaign] Failed to activate ${type} campaign:`, error);
      }
    }
  } catch (error) {
    console.error('[Auto-Campaign] Error:', error);
  }
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Triggers auto-rebuy checks for fuel and CO2 based on current prices.
 * Called by bunker-management.js whenever prices update (every 30-35 seconds).
 *
 * This is the event-driven entry point for price-dependent automation.
 * Fuel/CO2 rebuy logic executes immediately when prices drop, without
 * waiting for the global automation loop.
 *
 * @async
 * @param {Object} settings - User settings object from window.getSettings()
 * @param {boolean} settings.autoRebuyFuel - Whether fuel auto-rebuy is enabled
 * @param {boolean} settings.autoRebuyCO2 - Whether CO2 auto-rebuy is enabled
 * @returns {Promise<void>}
 * @public
 */
export async function triggerAutoRebuyChecks(settings) {
  try {
    await Promise.all([
      checkAutoRebuyFuel(settings),
      checkAutoRebuyCO2(settings)
    ]);
  } catch (error) {
    console.error('[Auto-Rebuy] Error:', error);
  }
}

/**
 * Main automation loop that runs non-price-dependent checks.
 * Executes vessel departure, repair, and campaign renewal automation.
 *
 * This function is called by the global automation scheduler (initAutomation)
 * at random 1-3 minute intervals. Price-dependent features (fuel/CO2 rebuy)
 * are NOT included here - they use triggerAutoRebuyChecks() instead.
 *
 * **Features Checked:**
 * - Auto-Depart All Vessels (with 1-2 min throttling)
 * - Auto Bulk Repair (with 1-2 min throttling)
 * - Auto Campaign Renewal (with 2-3 min throttling)
 *
 * @async
 * @returns {Promise<void>}
 * @public
 */
export async function runAutomationChecks() {
  try {
    // Get current settings dynamically
    const settings = window.getSettings ? window.getSettings() : {};

    // Run non-price-dependent checks
    await Promise.all([
      checkAutoDepartAll(settings),
      checkAutoBulkRepair(settings),
      checkAutoCampaignRenewal(settings)
    ]);
  } catch (error) {
    console.error('[Automation] Error in automation loop:', error);
  }
}

/**
 * Initializes the AutoPilot automation system with randomized scheduling.
 *
 * **Scheduling Strategy:**
 * - Initial check runs after 5 seconds (warmup delay)
 * - Subsequent checks run at random intervals between 1-3 minutes
 * - Each interval is randomly generated to prevent predictable patterns
 * - Uses recursive setTimeout to schedule next check after current completes
 *
 * **What Gets Scheduled:**
 * Only non-price-dependent features (depart/repair/campaign) are scheduled here.
 * Fuel/CO2 rebuy runs event-driven via triggerAutoRebuyChecks() when prices update.
 *
 * This function should be called once on application startup.
 *
 * @returns {void}
 * @public
 */
export function initAutomation() {
  console.log('[Automation] System initialized - checks run every 1-3 minutes');

  // Run checks with random interval between 1-3 minutes
  function scheduleNextCheck() {
    const minInterval = 60000; // 1 minute
    const maxInterval = 180000; // 3 minutes
    const randomInterval = minInterval + Math.random() * (maxInterval - minInterval);

    setTimeout(() => {
      runAutomationChecks();
      scheduleNextCheck(); // Schedule next check
    }, randomInterval);
  }

  // Run initial check after 5 seconds
  setTimeout(() => {
    runAutomationChecks();
    scheduleNextCheck(); // Start the loop
  }, 5000);
}
