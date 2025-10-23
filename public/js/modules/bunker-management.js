/**
 * @fileoverview Bunker Management Module - Handles fuel and CO2 quota purchasing, real-time price monitoring,
 * and automated price alerts for the Shipping Manager game. This module tracks commodity prices in 30-minute
 * UTC time slots and triggers browser/desktop notifications when prices fall below user-defined thresholds.
 * Also monitors marketing campaign status and notifies users when campaigns are not fully active.
 *
 * Key Features:
 * - Real-time fuel and CO2 price tracking with 30-minute UTC time slot granularity
 * - Price alert system with browser notifications when thresholds are met
 * - Maximum capacity tracking and purchase cost calculations
 * - Marketing campaign monitoring (3 types: reputation, awareness, green)
 * - Auto-rebuy integration for automated purchasing when conditions are met
 *
 * Price Alert Logic:
 * - Alerts trigger once per price change (prevents spam)
 * - Resets when price goes above threshold (allows re-alert on next drop)
 * - Supports both in-app visual alerts and desktop notifications
 *
 * @module bunker-management
 * @requires utils - Formatting, feedback, and notification functions
 * @requires api - Backend API calls for price data and purchases
 * @requires ui-dialogs - Confirmation dialogs for purchases
 */

import { formatNumber, showSideNotification, showNotification } from './utils.js';
import { fetchBunkerPrices, purchaseFuel as apiPurchaseFuel, purchaseCO2 as apiPurchaseCO2, fetchCampaigns } from './api.js';
import { showConfirmDialog } from './ui-dialogs.js';

/**
 * Maximum fuel storage capacity in tons.
 * This is a hardcoded game constant representing the player's fuel tank size.
 * @type {number}
 */
let maxFuel = 5750;

/**
 * Maximum CO2 quota storage capacity in tons.
 * This is a hardcoded game constant representing the player's CO2 allowance capacity.
 * @type {number}
 */
let maxCO2 = 55000;

/**
 * Current fuel inventory in tons.
 * Updated from API responses and decremented when vessels depart.
 * @type {number}
 */
let currentFuel = 0;

/**
 * Current CO2 quota inventory in tons.
 * Can be negative if player exceeded their quota. Updated from API responses.
 * @type {number}
 */
let currentCO2 = 0;

/**
 * Current cash balance in dollars.
 * Updated from API responses and used for purchase affordability checks.
 * @type {number}
 */
let currentCash = 0;

/**
 * Current fuel price per ton in dollars.
 * Retrieved from API based on current UTC time slot (30-minute intervals).
 * @type {number}
 */
let fuelPrice = 0;

/**
 * Current CO2 quota price per ton in dollars.
 * Retrieved from API based on current UTC time slot (30-minute intervals).
 * @type {number}
 */
let co2Price = 0;

/**
 * Last fuel price that triggered an alert.
 * Used to prevent duplicate alerts for the same price. Resets when price goes above threshold.
 * @type {number|null}
 */
let lastFuelAlertPrice = null;

/**
 * Last CO2 price that triggered an alert.
 * Used to prevent duplicate alerts for the same price. Resets when price goes above threshold.
 * @type {number|null}
 */
let lastCO2AlertPrice = null;

/**
 * Last known count of active marketing campaigns.
 * Used to detect changes in campaign status and trigger alerts accordingly.
 * @type {number|null}
 */
let lastCampaignsCount = null;

/**
 * Updates bunker (fuel/CO2) status display and triggers price alerts if thresholds are met.
 * This is the core function for monitoring commodity prices and inventory levels.
 *
 * Price Monitoring Strategy:
 * - Prices update every 30 minutes based on UTC time slots (e.g., 14:00, 14:30, 15:00)
 * - Compares current prices against user-configured thresholds
 * - Triggers visual and desktop notifications when prices drop below thresholds
 * - Only alerts once per price drop to prevent notification spam
 *
 * Side Effects:
 * - Updates DOM elements for fuel, CO2, cash, and price displays
 * - Triggers browser notifications (if permission granted)
 * - Shows in-app price alert overlays
 * - Calls auto-rebuy checks via global callback (if AutoPilot enabled)
 * - Updates button tooltips with purchase calculations
 *
 * @async
 * @param {Object} settings - User settings object containing price thresholds
 * @param {number} settings.fuelThreshold - Fuel price threshold in $/ton for alerts
 * @param {number} settings.co2Threshold - CO2 price threshold in $/ton for alerts
 * @returns {Promise<void>}
 * @throws {Error} Silently catches and logs errors to console
 *
 * @example
 * // Called automatically every 30-35 seconds by main app
 * updateBunkerStatus({ fuelThreshold: 400, co2Threshold: 7 });
 */
export async function updateBunkerStatus(settings) {
  try {
    // Silent update - no user feedback for routine updates
    const data = await fetchBunkerPrices();

    currentFuel = (data.user.fuel || 0) / 1000;
    currentCO2 = (data.user.co2 || 0) / 1000;
    currentCash = data.user.cash || 0;

    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const currentTimeSlot = `${String(utcHours).padStart(2, '0')}:${utcMinutes < 30 ? '00' : '30'}`;

    const currentPriceData = data.data.prices.find(p => p.time === currentTimeSlot);

    if (currentPriceData) {
      fuelPrice = currentPriceData.fuel_price;
      co2Price = currentPriceData.co2_price;
    }

    const fuelDisplay = document.getElementById('fuelDisplay');
    const co2Display = document.getElementById('co2Display');
    const cashDisplay = document.getElementById('cashDisplay');
    const fuelPriceDisplay = document.getElementById('fuelPriceDisplay');
    const co2PriceDisplay = document.getElementById('co2PriceDisplay');

    fuelDisplay.innerHTML = `${formatNumber(Math.floor(currentFuel))} <b>t</b> <b>/</b> ${formatNumber(Math.floor(maxFuel))} <b>t</b>`;

    if (currentCO2 < 0) {
      co2Display.innerHTML = `-${formatNumber(Math.floor(Math.abs(currentCO2)))} <b>t</b> <b>/</b> ${formatNumber(Math.floor(maxCO2))} <b>t</b>`;
    } else {
      co2Display.innerHTML = `${formatNumber(Math.floor(currentCO2))} <b>t</b> <b>/</b> ${formatNumber(Math.floor(maxCO2))} <b>t</b>`;
    }

    cashDisplay.textContent = `$${formatNumber(currentCash)}`;

    if (fuelPrice <= settings.fuelThreshold) {
      fuelPriceDisplay.textContent = `$${formatNumber(fuelPrice)}/t`;
      fuelPriceDisplay.style.color = '#4ade80';
      fuelPriceDisplay.style.fontWeight = '700';
    } else {
      fuelPriceDisplay.textContent = `$${formatNumber(fuelPrice)}/t`;
      fuelPriceDisplay.style.color = '#9ca3af';
      fuelPriceDisplay.style.fontWeight = '500';
    }

    if (co2Price <= settings.co2Threshold) {
      co2PriceDisplay.textContent = `$${formatNumber(co2Price)}/t`;
      co2PriceDisplay.style.color = '#4ade80';
      co2PriceDisplay.style.fontWeight = '700';
    } else {
      co2PriceDisplay.textContent = `$${formatNumber(co2Price)}/t`;
      co2PriceDisplay.style.color = '#9ca3af';
      co2PriceDisplay.style.fontWeight = '500';
    }

    const fuelNeeded = Math.max(0, maxFuel - currentFuel);
    const co2Needed = Math.max(0, maxCO2 - currentCO2);
    const fuelCost = fuelNeeded * fuelPrice;
    const co2Cost = co2Needed * co2Price;

    document.getElementById('fuelBtn').title = `Buy ${formatNumber(fuelNeeded)}t fuel for $${formatNumber(fuelCost)} (Price: $${fuelPrice}/t)`;
    document.getElementById('co2Btn').title = `Buy ${formatNumber(co2Needed)}t CO2 for $${formatNumber(co2Cost)} (Price: $${co2Price}/t)`;

    const hasPermission = Notification.permission === "granted";
    const desktopNotifsEnabled = settings.enableDesktopNotifications !== undefined ? settings.enableDesktopNotifications : true;

    if (fuelPrice <= settings.fuelThreshold && lastFuelAlertPrice !== fuelPrice) {
      lastFuelAlertPrice = fuelPrice;

      if (hasPermission && desktopNotifsEnabled) {
        await showNotification('⛽ Fuel Price Alert!', {
          body: `New price: $${fuelPrice}/t`,
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⛽</text></svg>",
          tag: 'fuel-alert',
          silent: false
        });
      }

      showSideNotification(`⛽ <strong>Fuel Price Alert!</strong><br><br>Current price: <strong style="color: #4ade80;">$${fuelPrice}/ton</strong><br>Your threshold: $${settings.fuelThreshold}/ton`, 'success', null, true);
    }

    if (co2Price <= settings.co2Threshold && lastCO2AlertPrice !== co2Price) {
      lastCO2AlertPrice = co2Price;

      if (hasPermission && desktopNotifsEnabled) {
        await showNotification('💨 CO2 Price Alert!', {
          body: `New price: $${co2Price}/t`,
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>💨</text></svg>",
          tag: 'co2-alert',
          silent: false
        });
      }

      showSideNotification(`💨 <strong>CO2 Price Alert!</strong><br><br>Current price: <strong style="color: #4ade80;">$${co2Price}/ton</strong><br>Your threshold: $${settings.co2Threshold}/ton`, 'success', null, true);
    }

    if (fuelPrice > settings.fuelThreshold) {
      lastFuelAlertPrice = null;
    }
    if (co2Price > settings.co2Threshold) {
      lastCO2AlertPrice = null;
    }

    // Trigger auto-rebuy checks (prices already updated above)
    if (window.triggerAutoRebuyChecks) {
      window.triggerAutoRebuyChecks(settings);
    }

  } catch (error) {
    console.error('Error updating bunker status:', error);
  }
}

/**
 * Updates marketing campaigns status display and triggers alerts for inactive campaigns.
 * Monitors three required campaign types: reputation, awareness, and green.
 *
 * Campaign Monitoring Logic:
 * - Checks if all 3 required campaign types are active
 * - Updates badge display showing active count (hidden if all 3 active)
 * - On first load: alerts if not all campaigns active
 * - On subsequent checks: alerts on any count change
 * - Shows success feedback when reaching 3/3 active
 *
 * Side Effects:
 * - Updates DOM badge display and button tooltip
 * - Triggers desktop notifications for campaign status changes
 * - Shows in-app price alerts for campaign warnings
 * - Updates lastCampaignsCount state for change detection
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} Silently catches and logs errors to console
 *
 * @example
 * // Called automatically every 30-35 seconds alongside bunker updates
 * updateCampaignsStatus();
 */
export async function updateCampaignsStatus() {
  try {
    const data = await fetchCampaigns();

    const activeCampaigns = data.data.active_campaigns || [];
    const activeTypes = new Set(activeCampaigns.map(c => c.option_name));

    const requiredTypes = ['reputation', 'awareness', 'green'];
    const activeCount = requiredTypes.filter(type => activeTypes.has(type)).length;

    const badge = document.getElementById('campaignsCount');
    const button = document.getElementById('campaignsBtn');

    if (activeCount === 3) {
      badge.style.display = 'none';
    } else {
      badge.textContent = activeCount;
      badge.style.display = 'block';
      badge.style.background = '#ef4444';
    }

    const statusList = requiredTypes.map(type => {
      const isActive = activeTypes.has(type);
      const icon = isActive ? '✓' : '✗';
      const name = type.charAt(0).toUpperCase() + type.slice(1);
      return `${icon} ${name}`;
    }).join('\n');

    button.title = `Marketing Campaigns (${activeCount}/3 active)\n${statusList}`;

    if (lastCampaignsCount === null) {
      if (activeCount !== 3) {
        showSideNotification(`📊 <strong>Marketing Campaigns</strong><br><br>Only ${activeCount}/3 campaigns are active!`, 'warning', null, true);

        if (Notification.permission === 'granted') {
          await showNotification('📊 Marketing Campaigns Alert!', {
            body: `Only ${activeCount}/3 campaigns active`,
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>📊</text></svg>",
            tag: 'campaigns-alert',
            silent: false
          });
        }
      }
    } else if (lastCampaignsCount !== activeCount) {
      if (activeCount === 3) {
        showSideNotification('✅ All 3 marketing campaigns are now active!', 'success');
      } else {
        showSideNotification(`⚠️ <strong>Marketing Campaigns</strong><br><br>${activeCount}/3 campaigns active`, 'warning', null, true);

        if (Notification.permission === 'granted') {
          await showNotification('📊 Marketing Campaigns Alert!', {
            body: `Only ${activeCount}/3 campaigns active`,
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>📊</text></svg>",
            tag: 'campaigns-alert',
            silent: false
          });
        }
      }
    }

    lastCampaignsCount = activeCount;

  } catch (error) {
    console.error('Error updating campaigns status:', error);
  }
}

/**
 * Initiates purchase of fuel to fill the tank to maximum capacity.
 * Calculates amount needed, shows confirmation dialog with cost breakdown, and processes purchase.
 *
 * Purchase Flow:
 * 1. Calculate fuel needed (maxFuel - currentFuel)
 * 2. Check if already full (early exit if needed = 0)
 * 3. Calculate total cost (needed × current price)
 * 4. Show confirmation dialog with purchase details
 * 5. Process API purchase if confirmed
 * 6. Trigger bunker status refresh after successful purchase
 *
 * Side Effects:
 * - Shows confirmation dialog (blocks until user responds)
 * - Makes API call to purchase fuel
 * - Updates UI via debounced bunker status refresh
 * - Shows success/error feedback messages
 *
 * @async
 * @returns {Promise<void>}
 *
 * @example
 * // User clicks "Buy Fuel" button
 * buyMaxFuel();
 * // Shows dialog: "Purchase 2,500t fuel for $1,000,000?"
 */
export async function buyMaxFuel() {
  const fuelNeeded = Math.max(0, maxFuel - currentFuel);

  if (fuelNeeded === 0) {
    showSideNotification('⛽ Fuel tank is already full!', 'info');
    return;
  }

  const totalCost = fuelNeeded * fuelPrice;

  const confirmed = await showConfirmDialog({
    title: '⛽ Purchase Fuel',
    message: 'Do you want to purchase fuel to fill your tank?',
    confirmText: 'Buy Fuel',
    details: [
      { label: 'Amount needed', value: `${formatNumber(fuelNeeded)}t` },
      { label: 'Price per ton', value: `$${formatNumber(fuelPrice)}/t` },
      { label: 'Total Cost', value: `$${formatNumber(totalCost)}` },
      { label: 'Available Cash', value: `$${formatNumber(currentCash)}` }
    ]
  });

  if (!confirmed) {
    return;
  }

  try {
    const data = await apiPurchaseFuel(fuelNeeded);

    if (data.error) {
      showSideNotification(`⛽ <strong>Purchase Failed</strong><br><br>${data.error}`, 'error');
    } else {
      showSideNotification(`⛽ <strong>Fuel Purchased!</strong><br><br>Amount: ${formatNumber(fuelNeeded)}t<br>Cost: $${formatNumber(totalCost)}`, 'success');
      if (window.debouncedUpdateBunkerStatus) {
        window.debouncedUpdateBunkerStatus(500);
      }
    }
  } catch (error) {
    showSideNotification(`⛽ <strong>Error</strong><br><br>${error.message}`, 'error');
  }
}

/**
 * Initiates purchase of CO2 quota to fill storage to maximum capacity.
 * Calculates amount needed, shows confirmation dialog with cost breakdown, and processes purchase.
 *
 * Purchase Flow:
 * 1. Calculate CO2 needed (maxCO2 - currentCO2)
 * 2. Check if already full (early exit if needed = 0)
 * 3. Calculate total cost (needed × current price)
 * 4. Show confirmation dialog with purchase details
 * 5. Process API purchase if confirmed
 * 6. Trigger bunker status refresh after successful purchase
 *
 * Side Effects:
 * - Shows confirmation dialog (blocks until user responds)
 * - Makes API call to purchase CO2 quota
 * - Updates UI via debounced bunker status refresh
 * - Shows success/error feedback messages
 *
 * @async
 * @returns {Promise<void>}
 *
 * @example
 * // User clicks "Buy CO2" button
 * buyMaxCO2();
 * // Shows dialog: "Purchase 25,000t CO2 for $175,000?"
 */
export async function buyMaxCO2() {
  const co2Needed = Math.max(0, maxCO2 - currentCO2);

  if (co2Needed === 0) {
    showSideNotification('💨 CO2 storage is already full!', 'info');
    return;
  }

  const totalCost = co2Needed * co2Price;

  const confirmed = await showConfirmDialog({
    title: '💨 Purchase CO2 Quota',
    message: 'Do you want to purchase CO2 quota to fill your storage?',
    confirmText: 'Buy CO2',
    details: [
      { label: 'Amount needed', value: `${formatNumber(co2Needed)}t` },
      { label: 'Price per ton', value: `$${formatNumber(co2Price)}/t` },
      { label: 'Total Cost', value: `$${formatNumber(totalCost)}` },
      { label: 'Available Cash', value: `$${formatNumber(currentCash)}` }
    ]
  });

  if (!confirmed) {
    return;
  }

  try {
    const data = await apiPurchaseCO2(co2Needed);

    if (data.error) {
      showSideNotification(`💨 <strong>Purchase Failed</strong><br><br>${data.error}`, 'error');
    } else {
      showSideNotification(`💨 <strong>CO2 Purchased!</strong><br><br>Amount: ${formatNumber(co2Needed)}t<br>Cost: $${formatNumber(totalCost)}`, 'success');
      if (window.debouncedUpdateBunkerStatus) {
        window.debouncedUpdateBunkerStatus(500);
      }
    }
  } catch (error) {
    showSideNotification(`💨 <strong>Error</strong><br><br>${error.message}`, 'error');
  }
}

/**
 * Returns a snapshot of the current bunker inventory and pricing state.
 * Used by other modules to access bunker data without direct variable access.
 *
 * This function provides read-only access to critical bunker management data,
 * allowing other modules (like vessel-management) to check affordability and
 * inventory levels before performing operations.
 *
 * @returns {Object} Current bunker state object
 * @returns {number} return.currentFuel - Current fuel inventory in tons
 * @returns {number} return.currentCO2 - Current CO2 quota in tons (can be negative)
 * @returns {number} return.currentCash - Current cash balance in dollars
 * @returns {number} return.fuelPrice - Current fuel price per ton in dollars
 * @returns {number} return.co2Price - Current CO2 price per ton in dollars
 * @returns {number} return.maxFuel - Maximum fuel capacity in tons
 * @returns {number} return.maxCO2 - Maximum CO2 capacity in tons
 *
 * @example
 * const bunkerState = getCurrentBunkerState();
 * if (bunkerState.currentCash >= purchaseCost) {
 *   // Proceed with purchase
 * }
 */
export function getCurrentBunkerState() {
  return {
    currentFuel,
    currentCO2,
    currentCash,
    fuelPrice,
    co2Price,
    maxFuel,
    maxCO2
  };
}

/**
 * Updates the current cash balance and refreshes the UI display.
 * Used by other modules to update cash after purchases or vessel operations.
 *
 * This function provides a centralized way to update cash display without
 * directly accessing module-level variables, maintaining encapsulation.
 *
 * Side Effects:
 * - Updates module-level currentCash variable
 * - Updates DOM element with formatted cash value
 *
 * @param {number} newCash - New cash balance in dollars
 *
 * @example
 * // After purchasing a vessel for $5,000,000
 * const currentState = getCurrentBunkerState();
 * updateCurrentCash(currentState.currentCash - 5000000);
 */
export function updateCurrentCash(newCash) {
  currentCash = newCash;
  document.getElementById('cashDisplay').textContent = `$${formatNumber(currentCash)}`;
}

/**
 * Updates the current fuel inventory and refreshes the UI display.
 * Used by other modules to update fuel after vessel departures or refueling.
 *
 * Side Effects:
 * - Updates module-level currentFuel variable
 * - Updates DOM element with formatted fuel value showing current/max
 *
 * @param {number} newFuel - New fuel inventory in tons
 *
 * @example
 * // After vessels depart and use 150 tons of fuel
 * const currentState = getCurrentBunkerState();
 * updateCurrentFuel(currentState.currentFuel - 150);
 */
export function updateCurrentFuel(newFuel) {
  currentFuel = newFuel;
  document.getElementById('fuelDisplay').innerHTML = `${formatNumber(Math.floor(currentFuel))} <b>t</b> <b>/</b> ${formatNumber(Math.floor(maxFuel))} <b>t</b>`;
}

/**
 * Updates the current CO2 quota inventory and refreshes the UI display.
 * Handles negative values (quota overage) with special formatting.
 *
 * Side Effects:
 * - Updates module-level currentCO2 variable
 * - Updates DOM element with formatted CO2 value showing current/max
 * - Displays negative sign prefix when quota is exceeded
 *
 * @param {number} newCO2 - New CO2 quota in tons (can be negative)
 *
 * @example
 * // After vessels depart and emit 300 tons of CO2
 * const currentState = getCurrentBunkerState();
 * updateCurrentCO2(currentState.currentCO2 - 300);
 * // Display might show: "-50 t / 55,000 t" if player exceeded quota
 */
export function updateCurrentCO2(newCO2) {
  currentCO2 = newCO2;
  if (currentCO2 < 0) {
    document.getElementById('co2Display').innerHTML = `-${formatNumber(Math.floor(Math.abs(currentCO2)))} <b>t</b> <b>/</b> ${formatNumber(Math.floor(maxCO2))} <b>t</b>`;
  } else {
    document.getElementById('co2Display').innerHTML = `${formatNumber(Math.floor(currentCO2))} <b>t</b> <b>/</b> ${formatNumber(Math.floor(maxCO2))} <b>t</b>`;
  }
}
