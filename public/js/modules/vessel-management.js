/**
 * @fileoverview Vessel Management Module - Handles all vessel-related operations including purchasing,
 * departures, bulk repair, and vessel catalog browsing with filtering.
 *
 * Key Features:
 * - Vessel count tracking (ready to depart, at anchor, pending delivery)
 * - Bulk departure with fuel/CO2 consumption and income calculation
 * - Bulk repair system with wear threshold filtering
 * - Vessel catalog with container/tanker filtering
 * - Engine type filtering for specialized searches
 * - Multi-vessel purchase with confirmation and sequential API calls
 * - Stock price display for IPO companies
 * - Pending vessel tracking with delivery countdown
 *
 * Purchase Flow:
 * - Single purchase: Click "Buy Now" for immediate purchase
 * - Bulk purchase: Select multiple vessels, click "Bulk Buy"
 * - Sequential API calls with 1.5s delay to prevent rate limiting
 * - Cash updates after each successful purchase
 * - Auto-stops on limit reached or insufficient funds
 *
 * Departure System:
 * - Departs all vessels in "port" status simultaneously
 * - Calculates fuel consumption and CO2 emissions
 * - Shows income from vessel departures minus harbor fees
 * - Updates bunker inventory immediately for UX responsiveness
 * - Refreshes vessel and bunker status after completion
 *
 * Repair System:
 * - Filters vessels by wear percentage threshold (user configurable)
 * - Fetches repair costs for all qualifying vessels
 * - Shows total cost with affordability check
 * - Bulk repair via single API call
 *
 * @module vessel-management
 * @requires utils - Formatting and feedback functions
 * @requires api - Vessel API endpoints
 * @requires ui-dialogs - Confirmation dialogs
 * @requires bunker-management - Cash and fuel inventory management
 */

import { formatNumber, showFeedback, showPriceAlert } from './utils.js';
import { escapeHtml } from './utils.js';
import {
  fetchVessels,
  fetchUserSettings,
  departAllVessels as apiDepartAllVessels,
  fetchAcquirableVessels,
  purchaseVessel as apiPurchaseVessel,
  getMaintenanceCost,
  doWearMaintenanceBulk
} from './api.js';
import { showConfirmDialog } from './ui-dialogs.js';
import { getCurrentBunkerState, updateCurrentCash, updateCurrentFuel, updateCurrentCO2 } from './bunker-management.js';

/**
 * Array of all vessels available for purchase.
 * Populated from API and filtered by type/engine for display.
 * @type {Array<Object>}
 */
let allAcquirableVessels = [];

/**
 * Current vessel type filter: 'container' or 'tanker'.
 * @type {string}
 */
let currentVesselFilter = 'container';

/**
 * Current engine type filter (null shows all engines).
 * Populated from unique engine types in vessel catalog.
 * @type {string|null}
 */
let selectedEngineType = null;

/**
 * Array of selected vessels for bulk purchase.
 * Each item contains vessel object and quantity.
 * @type {Array<{vessel: Object, quantity: number}>}
 */
let selectedVessels = [];

/**
 * Updates vessel count badges and status displays for different vessel states.
 * Fetches current vessel data and updates UI badges for ready-to-depart, at-anchor, and pending vessels.
 *
 * Vessel States:
 * - 'port': Ready to depart (shows on depart button badge)
 * - 'anchor': At anchor waiting for route planning (shows on anchor button)
 * - 'pending': Vessel purchased but not yet delivered (shows delivery countdown)
 *
 * Additional Data Updates:
 * - Anchor capacity: Available slots vs maximum
 * - Stock price: For companies that have gone IPO
 * - Stock trend: Up/down indicator
 *
 * Side Effects:
 * - Fetches vessel and user settings data from API
 * - Updates multiple DOM badges and displays
 * - Enables/disables buttons based on vessel availability
 * - Updates button tooltips with contextual information
 *
 * @async
 * @returns {Promise<void>}
 *
 * @example
 * // Called automatically every 30-35 seconds
 * updateVesselCount();
 */
export async function updateVesselCount() {
  try {
    const data = await fetchVessels();
    const vessels = data.vessels || [];

    const readyToDepart = vessels.filter(v => v.status === 'port').length;
    const atAnchor = vessels.filter(v => v.status === 'anchor').length;
    const pendingVessels = vessels.filter(v => v.status === 'pending').length;

    const pendingBadge = document.getElementById('pendingVesselsBadge');
    if (pendingBadge) {
      if (pendingVessels > 0) {
        pendingBadge.textContent = pendingVessels;
        pendingBadge.style.display = 'block';
      } else {
        pendingBadge.style.display = 'none';
      }
    }

    const pendingBtn = document.getElementById('filterPendingBtn');
    const pendingCountSpan = document.getElementById('pendingCount');
    if (pendingBtn && pendingCountSpan) {
      if (pendingVessels > 0) {
        pendingCountSpan.textContent = pendingVessels;
        pendingBtn.style.display = 'block';
      } else {
        pendingBtn.style.display = 'none';
      }
    }

    const countBadge = document.getElementById('vesselCount');
    const departBtn = document.getElementById('departAllBtn');

    if (readyToDepart > 0) {
      countBadge.textContent = readyToDepart;
      countBadge.style.display = 'block';
      departBtn.disabled = false;
      departBtn.title = `Depart all ${readyToDepart} vessel${readyToDepart === 1 ? '' : 's'} from harbor`;
    } else {
      countBadge.style.display = 'none';
      departBtn.disabled = true;
      departBtn.title = 'No vessels ready to depart';
    }

    const anchorBadge = document.getElementById('anchorCount');
    const anchorBtn = document.getElementById('anchorBtn');

    if (atAnchor > 0) {
      anchorBadge.textContent = atAnchor;
      anchorBadge.style.display = 'block';
      anchorBtn.disabled = false;
      anchorBtn.title = `${atAnchor} vessel${atAnchor === 1 ? '' : 's'} at anchor`;
    } else {
      anchorBadge.style.display = 'none';
      anchorBtn.disabled = true;
      anchorBtn.title = 'No vessels at anchor';
    }

    const settingsResponse = await fetchUserSettings();
    if (settingsResponse) {
      const maxAnchorPoints = settingsResponse.data?.settings?.anchor_points || 0;
      const stockValue = settingsResponse.user?.stock_value || 0;
      const stockTrend = settingsResponse.user?.stock_trend || '';

      const totalVessels = vessels.length;
      const availableCapacity = maxAnchorPoints - totalVessels;

      const anchorSlotsDisplay = document.getElementById('anchorSlotsDisplay');
      if (anchorSlotsDisplay) {
        anchorSlotsDisplay.textContent = `${availableCapacity}/${maxAnchorPoints}`;
      }

      const stockDisplay = document.getElementById('stockDisplay');
      const stockTrendElement = document.getElementById('stockTrend');
      const ipo = settingsResponse.user?.ipo || 0;

      if (stockDisplay && stockTrendElement) {
        const stockContainer = stockDisplay.parentElement;

        if (ipo === 1) {
          stockContainer.style.display = 'flex';
          stockDisplay.textContent = stockValue.toFixed(2);

          if (stockTrend === 'up') {
            stockTrendElement.textContent = '↑';
            stockTrendElement.style.color = '#4ade80';
          } else if (stockTrend === 'down') {
            stockTrendElement.textContent = '↓';
            stockTrendElement.style.color = '#ef4444';
          } else {
            stockTrendElement.textContent = '';
          }
        } else {
          stockContainer.style.display = 'none';
        }
      }
    }
  } catch (error) {
    console.error('Error updating vessel count:', error);
  }
}

/**
 * Departs all vessels currently in harbor (status 'port').
 * Calculates and displays fuel usage, CO2 emissions, income, and harbor fees.
 *
 * Departure Process:
 * 1. Disables depart button to prevent double-click
 * 2. Calls API to depart all ready vessels
 * 3. Extracts resource usage and income from response
 * 4. Updates local cash/fuel/CO2 immediately for UX
 * 5. Triggers delayed refresh of vessel and bunker displays
 * 6. Shows detailed price alert with departure summary
 *
 * Partial Departure Handling:
 * - If not all vessels departed (insufficient fuel): Shows error with count
 * - If no vessels departed: Shows critical error message
 * - If all departed successfully: Shows success message with details
 *
 * Resource Updates:
 * - Cash: Increased by (depart_income - harbor_fee)
 * - Fuel: Decreased by fuel_usage
 * - CO2: Decreased by co2_emission
 *
 * Side Effects:
 * - Makes API call to depart vessels
 * - Updates bunker state (cash, fuel, CO2)
 * - Triggers debounced vessel and bunker status updates
 * - Shows price alert with departure details
 * - Disables button during operation
 *
 * @async
 * @returns {Promise<void>}
 *
 * @example
 * // User clicks "Depart All" button
 * departAllVessels();
 * // Shows: "5 vessels departed! Fuel: 150t, CO2: 45t, Net income: $125,000"
 */
export async function departAllVessels() {
  const departBtn = document.getElementById('departAllBtn');
  const vesselCountBadge = document.getElementById('vesselCount');
  const vesselsInHarbor = parseInt(vesselCountBadge.textContent) || 0;

  departBtn.disabled = true;

  try {
    const data = await apiDepartAllVessels();

    if (data.error) {
      showFeedback(`Error: ${data.error}`, 'error');
      departBtn.disabled = false;
      return;
    }

    const vesselsDeparted = data.data?.depart_info?.vessel_count || 0;
    const fuelUsed = (data.data?.depart_info?.fuel_usage || 0) / 1000;
    const co2Emitted = (data.data?.depart_info?.co2_emission || 0) / 1000;
    const departIncome = data.data?.depart_info?.depart_income || 0;
    const harborFee = data.data?.depart_info?.harbor_fee || 0;

    const bunkerState = getCurrentBunkerState();
    const netIncome = departIncome - harborFee;
    updateCurrentCash(bunkerState.currentCash + netIncome);
    updateCurrentFuel(bunkerState.currentFuel - fuelUsed);
    updateCurrentCO2(bunkerState.currentCO2 - co2Emitted);

    if (window.debouncedUpdateVesselCount && window.debouncedUpdateBunkerStatus) {
      setTimeout(() => window.debouncedUpdateVesselCount(800), 1000);
      setTimeout(() => window.debouncedUpdateBunkerStatus(800), 1200);
    }

    if (vesselsDeparted === 0) {
      showPriceAlert('🚢 No vessels could depart! Check fuel availability.', 'error');
    } else if (vesselsDeparted < vesselsInHarbor) {
      const vesselsRemaining = vesselsInHarbor - vesselsDeparted;
      showPriceAlert(`<strong>🚢 Only ${vesselsDeparted} of ${vesselsInHarbor} vessels departed!</strong><br><br>${vesselsRemaining} vessels remaining in harbor<br>⛽ Fuel used: ${formatNumber(fuelUsed)}t<br>💨 CO2 emitted: ${formatNumber(co2Emitted)}t<br>💰 Net income: $${formatNumber(netIncome)}<br><span style="opacity: 0.7; font-size: 0.9em;">(Income: $${formatNumber(departIncome)} - Fee: $${formatNumber(harborFee)})</span>`, 'error');
    } else {
      showPriceAlert(`<strong>🚢 All ${vesselsDeparted} vessel${vesselsDeparted === 1 ? '' : 's'} departed!</strong><br><br>⛽ Fuel used: ${formatNumber(fuelUsed)}t<br>💨 CO2 emitted: ${formatNumber(co2Emitted)}t<br>💰 Net income: $${formatNumber(netIncome)}<br><span style="opacity: 0.7; font-size: 0.9em;">(Income: $${formatNumber(departIncome)} - Fee: $${formatNumber(harborFee)})</span>`, 'success');
    }

  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
    departBtn.disabled = false;
  }
}

export async function updateRepairCount(settings) {
  try {
    const data = await fetchVessels();
    const vessels = data.vessels || [];

    const vesselsNeedingRepair = vessels.filter(v => {
      const wear = parseInt(v.wear) || 0;
      return wear >= settings.maintenanceThreshold;
    });

    const countBadge = document.getElementById('repairCount');
    const repairBtn = document.getElementById('repairAllBtn');

    if (vesselsNeedingRepair.length > 0) {
      countBadge.textContent = vesselsNeedingRepair.length;
      countBadge.style.display = 'block';
      repairBtn.disabled = false;
      repairBtn.title = `Repair ${vesselsNeedingRepair.length} vessel${vesselsNeedingRepair.length === 1 ? '' : 's'} with ${settings.maintenanceThreshold}%+ wear`;
    } else {
      countBadge.style.display = 'none';
      repairBtn.disabled = true;
      repairBtn.title = `No vessels with ${settings.maintenanceThreshold}%+ wear`;
    }
  } catch (error) {
    console.error('Error updating repair count:', error);
  }
}

/**
 * Repairs all vessels with wear at or above the configured maintenance threshold.
 * Shows confirmation dialog with total cost and processes bulk repair.
 *
 * Repair Flow:
 * 1. Fetch current vessels from API
 * 2. Filter vessels by wear threshold from settings
 * 3. Get repair cost estimate for all qualifying vessels
 * 4. Check affordability (cash >= total cost)
 * 5. Show confirmation dialog with cost breakdown
 * 6. Process bulk repair API call
 * 7. Update bunker status and repair count displays
 *
 * Cost Calculation:
 * - Fetches maintenance data for each vessel
 * - Sums "wear" type maintenance costs
 * - Compares against current cash
 *
 * Side Effects:
 * - Fetches vessel and maintenance cost data
 * - Shows confirmation dialog
 * - Makes bulk repair API call
 * - Updates cash via bunker state
 * - Triggers debounced status updates
 * - Shows success/error feedback
 * - Disables button during operation
 *
 * @async
 * @param {Object} settings - User settings object
 * @param {number} settings.maintenanceThreshold - Minimum wear percentage to trigger repair
 * @returns {Promise<void>}
 *
 * @example
 * // Repairs all vessels with 10%+ wear
 * repairAllVessels({ maintenanceThreshold: 10 });
 */
export async function repairAllVessels(settings) {
  const repairBtn = document.getElementById('repairAllBtn');
  const repairCountBadge = document.getElementById('repairCount');
  const vesselsNeedingRepair = parseInt(repairCountBadge.textContent) || 0;

  if (vesselsNeedingRepair === 0) return;

  try {
    const data = await fetchVessels();
    const vessels = data.vessels || [];

    const vesselsToRepair = vessels.filter(v => {
      const wear = parseInt(v.wear) || 0;
      return wear >= settings.maintenanceThreshold;
    });

    if (vesselsToRepair.length === 0) {
      showFeedback('No vessels need repair!', 'error');
      return;
    }

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
      showFeedback(`<strong>Not enough cash!</strong><br><br>Repair cost: $${formatNumber(totalCost)}<br>Your cash: $${formatNumber(bunkerState.currentCash)}<br>Missing: $${formatNumber(totalCost - bunkerState.currentCash)}`, 'error');
      return;
    }

    const confirmed = await showConfirmDialog({
      title: '🔧 Bulk Vessel Repair',
      message: `Do you want to repair all vessels with ${settings.maintenanceThreshold}%+ wear?`,
      confirmText: 'Repair All',
      details: [
        { label: 'Vessels to repair', value: `${vesselsToRepair.length}` },
        { label: 'Wear threshold', value: `${settings.maintenanceThreshold}%` },
        { label: 'Total Cost', value: `$${formatNumber(totalCost)}` },
        { label: 'Available Cash', value: `$${formatNumber(bunkerState.currentCash)}` }
      ]
    });

    if (!confirmed) return;

    repairBtn.disabled = true;

    const repairData = await doWearMaintenanceBulk(vesselIds);

    if (repairData.error) {
      showFeedback(`Error: ${repairData.error}`, 'error');
      repairBtn.disabled = false;
      return;
    }

    showFeedback(`<strong>${vesselsToRepair.length} vessels repaired!</strong><br><br>💰 Total cost: $${formatNumber(totalCost)}<br>🔧 Wear threshold: ${settings.maintenanceThreshold}%`, 'success');

    if (window.debouncedUpdateRepairCount && window.debouncedUpdateBunkerStatus) {
      setTimeout(() => window.debouncedUpdateRepairCount(800), 1000);
      setTimeout(() => window.debouncedUpdateBunkerStatus(800), 1200);
    }

  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
    repairBtn.disabled = false;
  }
}

export async function loadAcquirableVessels() {
  try {
    const data = await fetchAcquirableVessels();
    allAcquirableVessels = data.data.vessels_for_sale || [];
    displayVessels();
  } catch (error) {
    console.error('Error loading vessels:', error);
    document.getElementById('vesselCatalogFeed').innerHTML = `
      <div style="text-align: center; color: #ef4444; padding: 40px;">
        Failed to load vessels. Please try again.
      </div>
    `;
  }
}

function getCapacityDisplay(vessel) {
  if (typeof vessel.capacity_max === 'object' && vessel.capacity_max !== null) {
    if (vessel.capacity_type === 'container') {
      const dry = vessel.capacity_max.dry || 0;
      const refrigerated = vessel.capacity_max.refrigerated || 0;
      const total = dry + refrigerated;
      return `Dry: ${formatNumber(dry)} TEU + Refrigerated: ${formatNumber(refrigerated)} TEU = <strong>${formatNumber(total)} TEU</strong>`;
    } else {
      const crudeOil = vessel.capacity_max.crude_oil || 0;
      const fuel = vessel.capacity_max.fuel || 0;
      const total = crudeOil + fuel;
      return `Crude Oil: ${formatNumber(crudeOil)} BBL + Fuel: ${formatNumber(fuel)} BBL = <strong>${formatNumber(total)} BBL</strong>`;
    }
  } else {
    const value = vessel.capacity_max || 0;
    const unit = vessel.capacity_type === 'container' ? 'TEU' : 'BBL';
    return `${formatNumber(value)} ${unit}`;
  }
}

function getEfficiencyColor(factor) {
  if (factor < 1.0) return '#4ade80'; // green
  if (factor === 1.0) return '#9ca3af'; // gray
  return '#fb923c'; // orange
}

export function showPendingVessels(pendingVessels) {
  const feed = document.getElementById('vesselCatalogFeed');

  document.getElementById('filterContainerBtn').classList.remove('active');
  document.getElementById('filterTankerBtn').classList.remove('active');
  document.getElementById('filterEngineBtn').classList.remove('active');
  document.getElementById('filterPendingBtn').classList.add('active');

  const bulkBtn = document.getElementById('bulkBuyBtn');
  if (bulkBtn) bulkBtn.style.display = 'none';

  if (pendingVessels.length === 0) {
    feed.innerHTML = `
      <div style="text-align: center; color: #9ca3af; padding: 40px;">
        No pending vessels
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'vessel-catalog-grid';

  pendingVessels.forEach(vessel => {
    const imageUrl = `https://shippingmanager.cc/images/acquirevessels/${vessel.type}`;

    let timeDisplay = '';
    const remaining = vessel.time_arrival || 0;

    if (remaining > 0) {
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      if (days > 0) {
        timeDisplay = `${days}d ${hours}h`;
      } else if (hours > 0) {
        timeDisplay = `${hours}h ${minutes}m`;
      } else {
        timeDisplay = `${minutes}m`;
      }
    } else {
      timeDisplay = 'Ready';
    }

    const capacityDisplay = getCapacityDisplay(vessel);
    const co2Color = getEfficiencyColor(vessel.co2_factor || 1);
    const fuelColor = getEfficiencyColor(vessel.fuel_factor || 1);

    let additionalAttrs = '';
    if (vessel.width && vessel.width !== 0) {
      additionalAttrs += `<div class="vessel-spec"><strong>Width:</strong> ${vessel.width} m</div>`;
    }
    if (vessel.price_in_points && vessel.price_in_points !== 0) {
      additionalAttrs += `<div class="vessel-spec"><strong>Points Price:</strong> ${formatNumber(vessel.price_in_points)}</div>`;
    }
    if (vessel.perks && vessel.perks !== null) {
      additionalAttrs += `<div class="vessel-spec" style="grid-column: 1 / -1;"><strong>Perks:</strong> ${vessel.perks}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'vessel-card pending-vessel';
    card.innerHTML = `
      <div style="position: relative;">
        <img src="${imageUrl}" alt="${vessel.name}" class="vessel-image" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect fill=%22%23374151%22 width=%22400%22 height=%22300%22/><text x=%2250%%22 y=%2250%%22 fill=%22%239ca3af%22 text-anchor=%22middle%22 font-size=%2224%22>⛴️</text></svg>'">
        ${vessel.only_for_credits ? '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ef4444; font-size: 80px; font-weight: 900; text-shadow: 0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.8);">$</div>' : ''}
        <div style="position: absolute; top: 8px; left: 8px; background: rgba(249, 115, 22, 0.9); color: white; padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: 600;">⏱️ ${timeDisplay}</div>
        <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(16, 185, 129, 0.9); color: white; padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: 600;">$${formatNumber(vessel.price || 0)}</div>
      </div>
      <div class="vessel-content">
        <div class="vessel-header">
          <h3 class="vessel-name">${vessel.name}</h3>
        </div>
        <div class="vessel-specs">
          <div class="vessel-spec"><strong>Type:</strong> ${vessel.type_name || vessel.type}</div>
          <div class="vessel-spec"><strong>Year:</strong> ${vessel.year || 'N/A'}</div>
          <div class="vessel-spec" style="grid-column: 1 / -1;"><strong>Capacity:</strong> ${capacityDisplay}</div>
          <div class="vessel-spec"><strong>IMO:</strong> ${vessel.imo || 'N/A'}</div>
          <div class="vessel-spec"><strong>MMSI:</strong> ${vessel.mmsi || 'N/A'}</div>
          <div class="vessel-spec"><strong>Speed:</strong> ${vessel.max_speed || 0} kn</div>
          <div class="vessel-spec"><strong>Range:</strong> ${formatNumber(vessel.range || 0)} nm</div>
          <div class="vessel-spec"><strong>Engine:</strong> ${vessel.engine_type || 'N/A'} (${formatNumber(vessel.kw || 0)} kW)</div>
          <div class="vessel-spec"><strong>Length:</strong> ${vessel.length || 0} m</div>
          <div class="vessel-spec" style="color: ${co2Color};"><strong>CO2 Factor:</strong> ${vessel.co2_factor || 1}</div>
          <div class="vessel-spec" style="color: ${fuelColor};"><strong>Fuel Factor:</strong> ${vessel.fuel_factor || 1}</div>
          <div class="vessel-spec"><strong>Fuel Cap.:</strong> ${formatNumber(vessel.fuel_capacity || 0)} t</div>
          <div class="vessel-spec"><strong>Service:</strong> ${vessel.hours_between_service || 0}h</div>
          <div class="vessel-spec"><strong>Port:</strong> ${(vessel.current_port_code || '').replace(/_/g, ' ')}</div>
          ${vessel.gearless || vessel.antifouling || additionalAttrs ? '<div class="vessel-spec" style="grid-column: 1 / -1; border-top: 1px solid rgba(255, 255, 255, 0.1); margin-top: 8px; padding-top: 8px;"></div>' : ''}
          ${vessel.gearless ? '<div class="vessel-spec" style="grid-column: 1 / -1; color: #4ade80;"><strong>⚙️ Gearless:</strong> own cranes</div>' : ''}
          ${vessel.antifouling ? `<div class="vessel-spec" style="grid-column: 1 / -1; color: #a78bfa;"><strong>🛡️ Antifouling:</strong> ${vessel.antifouling}</div>` : ''}
          ${additionalAttrs}
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  feed.innerHTML = '';
  feed.appendChild(grid);
}

export function displayVessels() {
  const feed = document.getElementById('vesselCatalogFeed');

  let filtered;

  if (selectedEngineType) {
    filtered = allAcquirableVessels.filter(v => v.engine_type === selectedEngineType);
  } else {
    filtered = allAcquirableVessels.filter(v => v.capacity_type === currentVesselFilter);
  }

  if (filtered.length === 0) {
    const filterText = selectedEngineType
      ? `No vessels with engine type "${selectedEngineType}"`
      : `No ${currentVesselFilter} vessels available`;
    feed.innerHTML = `
      <div style="text-align: center; color: #9ca3af; padding: 40px;">
        ${filterText}
      </div>
    `;
    return;
  }

  filtered.sort((a, b) => a.price - b.price);

  const grid = document.createElement('div');
  grid.className = 'vessel-catalog-grid';

  filtered.forEach(vessel => {
    const selectedItem = selectedVessels.find(v => v.vessel.id === vessel.id);
    const isSelected = !!selectedItem;
    const imageUrl = `https://shippingmanager.cc/images/acquirevessels/${vessel.type}`;

    const capacityDisplay = getCapacityDisplay(vessel);
    const co2Color = getEfficiencyColor(vessel.co2_factor || 1);
    const fuelColor = getEfficiencyColor(vessel.fuel_factor || 1);

    let additionalAttrs = '';
    if (vessel.width && vessel.width !== 0) {
      additionalAttrs += `<div class="vessel-spec"><strong>Width:</strong> ${vessel.width} m</div>`;
    }
    if (vessel.price_in_points && vessel.price_in_points !== 0) {
      additionalAttrs += `<div class="vessel-spec"><strong>Points Price:</strong> ${formatNumber(vessel.price_in_points)}</div>`;
    }
    if (vessel.perks && vessel.perks !== null) {
      additionalAttrs += `<div class="vessel-spec" style="grid-column: 1 / -1;"><strong>Perks:</strong> ${vessel.perks}</div>`;
    }

    const card = document.createElement('div');
    card.className = `vessel-card${isSelected ? ' selected' : ''}`;
    card.innerHTML = `
      <div style="position: relative;">
        <img src="${imageUrl}" alt="${vessel.name}" class="vessel-image" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect fill=%22%23374151%22 width=%22400%22 height=%22300%22/><text x=%2250%%22 y=%2250%%22 fill=%22%239ca3af%22 text-anchor=%22middle%22 font-size=%2224%22>⛴️</text></svg>'">
        ${vessel.only_for_credits ? '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ef4444; font-size: 80px; font-weight: 900; text-shadow: 0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.8);">$</div>' : ''}
      </div>
      <div class="vessel-content">
        <div class="vessel-header">
          <h3 class="vessel-name">${vessel.name}</h3>
          <div class="vessel-price">$${formatNumber(vessel.price)}</div>
        </div>
        <div class="vessel-specs">
          <div class="vessel-spec"><strong>Type:</strong> ${vessel.type_name}</div>
          <div class="vessel-spec"><strong>Year:</strong> ${vessel.year}</div>
          <div class="vessel-spec" style="grid-column: 1 / -1;"><strong>Capacity:</strong> ${capacityDisplay}</div>
          <div class="vessel-spec"><strong>IMO:</strong> ${vessel.imo || 'N/A'}</div>
          <div class="vessel-spec"><strong>MMSI:</strong> ${vessel.mmsi || 'N/A'}</div>
          <div class="vessel-spec"><strong>Speed:</strong> ${vessel.max_speed} kn</div>
          <div class="vessel-spec"><strong>Range:</strong> ${formatNumber(vessel.range)} nm</div>
          <div class="vessel-spec"><strong>Engine:</strong> ${vessel.engine_type} (${formatNumber(vessel.kw)} kW)</div>
          <div class="vessel-spec"><strong>Length:</strong> ${vessel.length} m</div>
          <div class="vessel-spec" style="color: ${co2Color};"><strong>CO2 Factor:</strong> ${vessel.co2_factor || 1}</div>
          <div class="vessel-spec" style="color: ${fuelColor};"><strong>Fuel Factor:</strong> ${vessel.fuel_factor || 1}</div>
          <div class="vessel-spec"><strong>Fuel Cap.:</strong> ${formatNumber(vessel.fuel_capacity)} t</div>
          <div class="vessel-spec"><strong>Service:</strong> ${vessel.hours_between_service}h</div>
          <div class="vessel-spec"><strong>Port:</strong> ${vessel.current_port_code.replace(/_/g, ' ')}</div>
          ${vessel.gearless || vessel.antifouling || additionalAttrs ? '<div class="vessel-spec" style="grid-column: 1 / -1; border-top: 1px solid rgba(255, 255, 255, 0.1); margin-top: 8px; padding-top: 8px;"></div>' : ''}
          ${vessel.gearless ? '<div class="vessel-spec" style="grid-column: 1 / -1; color: #4ade80;"><strong>⚙️ Gearless:</strong> own cranes</div>' : ''}
          ${vessel.antifouling ? `<div class="vessel-spec" style="grid-column: 1 / -1; color: #a78bfa;"><strong>🛡️ Antifouling:</strong> ${vessel.antifouling}</div>` : ''}
          ${additionalAttrs}
        </div>
        <div class="vessel-actions">
          <input type="number" class="vessel-quantity-input" data-vessel-id="${vessel.id}" value="${isSelected ? selectedItem.quantity : 1}" min="1" max="99" />
          <div class="vessel-action-buttons">
            <button class="vessel-select-btn${isSelected ? ' selected' : ''}" data-vessel-id="${vessel.id}">
              ${isSelected ? `✓ Selected (${selectedItem.quantity}x)` : 'Select'}
            </button>
            <button class="vessel-buy-btn" data-vessel-id="${vessel.id}">
              Buy Now
            </button>
          </div>
        </div>
      </div>
    `;

    card.querySelector('.vessel-select-btn').addEventListener('click', () => {
      const quantityInput = card.querySelector('.vessel-quantity-input');
      const quantity = parseInt(quantityInput.value) || 1;
      toggleVesselSelection(vessel, quantity);
    });
    card.querySelector('.vessel-buy-btn').addEventListener('click', () => {
      const quantityInput = card.querySelector('.vessel-quantity-input');
      const quantity = parseInt(quantityInput.value) || 1;
      purchaseSingleVessel(vessel, quantity);
    });

    grid.appendChild(card);
  });

  feed.innerHTML = '';
  feed.appendChild(grid);
}

export function showEngineFilterOverlay() {
  const overlay = document.getElementById('engineFilterOverlay');
  const listContainer = document.getElementById('engineFilterList');

  const engineTypes = [...new Set(allAcquirableVessels.map(v => v.engine_type))].sort();

  let html = '<div style="max-width: 800px; margin: 0 auto;">';

  html += `
    <div class="chat-selection-item" data-engine="" style="cursor: pointer; padding: 15px; background: ${!selectedEngineType ? 'rgba(16, 185, 129, 0.2)' : 'rgba(31, 41, 55, 0.4)'}; border: 1px solid ${!selectedEngineType ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)'}; border-radius: 8px; transition: all 0.2s; margin-bottom: 10px;">
      <div style="font-weight: 600; color: #e0e0e0;">All Engines</div>
      <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">Show all vessels</div>
    </div>
  `;

  html += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">';

  engineTypes.forEach((engineType, index) => {
    const count = allAcquirableVessels.filter(v => v.engine_type === engineType).length;
    const isSelected = selectedEngineType === engineType;
    const isLastAndOdd = (index === engineTypes.length - 1) && (engineTypes.length % 2 !== 0);

    html += `
      <div class="chat-selection-item" data-engine="${engineType}" style="cursor: pointer; padding: 15px; background: ${isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(31, 41, 55, 0.4)'}; border: 1px solid ${isSelected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)'}; border-radius: 8px; transition: all 0.2s;${isLastAndOdd ? ' grid-column: 1 / -1; max-width: 50%; margin: 0 auto;' : ''}">
        <div style="font-weight: 600; color: #e0e0e0;">⚙️ ${engineType}</div>
        <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">${count} vessel${count === 1 ? '' : 's'} available</div>
      </div>
    `;
  });

  html += '</div></div>';
  listContainer.innerHTML = html;

  listContainer.querySelectorAll('.chat-selection-item').forEach(item => {
    item.addEventListener('click', () => {
      const engineType = item.getAttribute('data-engine');
      selectedEngineType = engineType || null;

      if (selectedEngineType) {
        document.getElementById('filterContainerBtn').classList.remove('active');
        document.getElementById('filterTankerBtn').classList.remove('active');
        document.getElementById('filterEngineBtn').classList.add('active');
      } else {
        document.getElementById('filterEngineBtn').classList.remove('active');
        if (currentVesselFilter === 'container') {
          document.getElementById('filterContainerBtn').classList.add('active');
        } else {
          document.getElementById('filterTankerBtn').classList.add('active');
        }
      }

      overlay.style.display = 'none';
      displayVessels();
    });

    item.addEventListener('mouseenter', function() {
      if (this.getAttribute('data-engine') !== selectedEngineType) {
        this.style.background = 'rgba(31, 41, 55, 0.6)';
      }
    });

    item.addEventListener('mouseleave', function() {
      const engineType = this.getAttribute('data-engine');
      const isSelected = (!engineType && !selectedEngineType) || (engineType === selectedEngineType);
      this.style.background = isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(31, 41, 55, 0.4)';
    });
  });

  overlay.style.display = 'flex';
}

export function closeEngineFilterOverlay() {
  document.getElementById('engineFilterOverlay').style.display = 'none';
}

function toggleVesselSelection(vessel, quantity) {
  const index = selectedVessels.findIndex(v => v.vessel.id === vessel.id);

  if (index > -1) {
    selectedVessels.splice(index, 1);
  } else {
    selectedVessels.push({ vessel, quantity });
  }

  const totalCount = selectedVessels.reduce((sum, item) => sum + item.quantity, 0);
  const selectedCountEl = document.getElementById('selectedCount');
  const bulkBuyBtn = document.getElementById('bulkBuyBtn');

  if (selectedCountEl) selectedCountEl.textContent = totalCount;
  if (bulkBuyBtn) bulkBuyBtn.style.display = selectedVessels.length > 0 ? 'block' : 'none';

  displayVessels();
}

/**
 * Purchases one or more copies of a specific vessel with confirmation and sequential processing.
 * Handles single and multi-quantity purchases with affordability checks and rate limiting.
 *
 * Purchase Flow:
 * 1. Calculate total cost (price × quantity)
 * 2. Build confirmation dialog with itemized list
 * 3. Show affordability indicator (green/red)
 * 4. Process purchases sequentially with 1.5s delays
 * 5. Update cash after each successful purchase
 * 6. Handle errors (limit reached, insufficient funds, network errors)
 * 7. Remove from selection list
 * 8. Refresh vessel catalog and counts
 *
 * Error Handling:
 * - 'vessel_limit_reached': Stops purchasing, shows count purchased
 * - 'not_enough_cash': Stops purchasing, shows count purchased
 * - Other errors: Shows error but may continue with remaining
 * - Network errors: Logs and shows feedback
 *
 * Rate Limiting:
 * - 1.5 second delay between purchases to prevent API throttling
 * - No delay after final purchase
 *
 * Side Effects:
 * - Shows confirmation dialog
 * - Makes multiple API calls (one per vessel)
 * - Updates cash after each purchase
 * - Removes from selectedVessels array
 * - Updates selection count badge
 * - Triggers vessel count refresh
 * - Reloads vessel catalog
 * - Shows success/error feedback
 *
 * @async
 * @param {Object} vessel - Vessel object to purchase
 * @param {number} [quantity=1] - Number of copies to purchase
 * @returns {Promise<void>}
 *
 * @example
 * // Buy 3 copies of a container vessel
 * purchaseSingleVessel(vesselObject, 3);
 */
export async function purchaseSingleVessel(vessel, quantity = 1) {
  const bunkerState = getCurrentBunkerState();
  const totalCost = vessel.price * quantity;

  const vesselDetails = [];
  for (let i = 0; i < quantity; i++) {
    vesselDetails.push({
      label: `${i + 1}. ${vessel.name}`,
      value: `$${formatNumber(vessel.price)}`
    });
  }
  vesselDetails.push({
    label: '────────────────────────',
    value: '────────────'
  });
  vesselDetails.push({
    label: 'Total Cost',
    value: `$${formatNumber(totalCost)}`
  });
  vesselDetails.push({
    label: 'Cash Available',
    value: `$${formatNumber(bunkerState.currentCash)}`
  });

  const confirmed = await showConfirmDialog({
    title: `Purchase ${quantity > 1 ? `${quantity} Vessels` : 'Vessel'}`,
    message: quantity > 1 ? 'Purchasing multiple vessels with 1.5s delay between each:' : null,
    details: vesselDetails,
    confirmText: 'Buy',
    cancelText: 'Cancel'
  });

  if (!confirmed) return;

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < quantity; i++) {
    try {
      const data = await apiPurchaseVessel(vessel.id, vessel.name, vessel.antifouling);

      if (data.error) {
        failCount++;
        if (data.error === 'vessel_limit_reached') {
          showFeedback(`❌ Vessel limit reached! Purchased ${successCount} vessel(s), cannot buy more.`, 'error');
          break;
        } else if (data.error === 'not_enough_cash') {
          showFeedback(`❌ Not enough cash! Purchased ${successCount} vessel(s), ran out of money.`, 'error');
          break;
        } else {
          showFeedback(`❌ Error: ${data.error} - Purchased ${successCount} so far`, 'error');
        }
      } else {
        successCount++;
        if (data.user && data.user.cash !== undefined) {
          updateCurrentCash(data.user.cash);
        }
      }

      if (i < quantity - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error) {
      failCount++;
      console.error('Error purchasing vessel:', error);
      showFeedback(`❌ Network error purchasing ${vessel.name}`, 'error');
    }
  }

  if (successCount > 0 && failCount === 0) {
    showFeedback(`✓ Successfully purchased ${successCount}x ${vessel.name}!`, 'success');
  }

  if (successCount > 0 && window.updateVesselCount) {
    await updateVesselCount();
  }

  selectedVessels = selectedVessels.filter(v => v.vessel.id !== vessel.id);
  const totalCount = selectedVessels.reduce((sum, item) => sum + item.quantity, 0);
  const selectedCountEl = document.getElementById('selectedCount');
  const bulkBuyBtn = document.getElementById('bulkBuyBtn');

  if (selectedCountEl) selectedCountEl.textContent = totalCount;
  if (bulkBuyBtn) bulkBuyBtn.style.display = selectedVessels.length > 0 ? 'block' : 'none';

  await loadAcquirableVessels();
}

export async function purchaseBulk() {
  if (selectedVessels.length === 0) return;

  const bunkerState = getCurrentBunkerState();
  const vesselDetails = [];
  let totalCost = 0;
  let itemNumber = 1;

  selectedVessels.forEach(item => {
    for (let i = 0; i < item.quantity; i++) {
      vesselDetails.push({
        label: `${itemNumber}. ${item.vessel.name}`,
        value: `$${formatNumber(item.vessel.price)}`
      });
      totalCost += item.vessel.price;
      itemNumber++;
    }
  });

  vesselDetails.push({
    label: '────────────────────────',
    value: '────────────'
  });
  vesselDetails.push({
    label: 'Total Cost',
    value: `$${formatNumber(totalCost)}`
  });
  vesselDetails.push({
    label: 'Cash Available',
    value: `$${formatNumber(bunkerState.currentCash)}`
  });

  const totalVesselCount = selectedVessels.reduce((sum, item) => sum + item.quantity, 0);

  const confirmed = await showConfirmDialog({
    title: `Bulk Purchase (${totalVesselCount} Vessels)`,
    message: 'Purchasing vessels sequentially with 1.5s delay between each:',
    details: vesselDetails,
    confirmText: 'Buy All',
    cancelText: 'Cancel'
  });

  if (!confirmed) return;

  const bulkBuyBtn = document.getElementById('bulkBuyBtn');
  bulkBuyBtn.disabled = true;
  bulkBuyBtn.textContent = 'Purchasing...';

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < selectedVessels.length; i++) {
    const item = selectedVessels[i];

    for (let q = 0; q < item.quantity; q++) {
      try {
        const data = await apiPurchaseVessel(item.vessel.id, item.vessel.name, item.vessel.antifouling);

        if (data.error) {
          failCount++;
          console.error(`Failed to purchase ${item.vessel.name}:`, data.error);

          if (data.error === 'vessel_limit_reached') {
            showFeedback(`❌ Vessel limit reached! Purchased ${successCount} vessel(s), could not buy more.`, 'error');
            i = selectedVessels.length;
            break;
          } else if (data.error === 'not_enough_cash') {
            showFeedback(`❌ Not enough cash! Purchased ${successCount} vessel(s), ran out of money.`, 'error');
            i = selectedVessels.length;
            break;
          } else {
            showFeedback(`❌ Error: ${data.error} - Purchased ${successCount} so far`, 'error');
          }
        } else {
          successCount++;
          if (data.user && data.user.cash !== undefined) {
            updateCurrentCash(data.user.cash);
          }
        }
      } catch (error) {
        failCount++;
        console.error(`Error purchasing ${item.vessel.name}:`, error);
        showFeedback(`❌ Network error purchasing ${item.vessel.name}`, 'error');
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  if (bulkBuyBtn) {
    bulkBuyBtn.disabled = false;
    bulkBuyBtn.textContent = `💰 Bulk Buy (0)`;
    bulkBuyBtn.style.display = 'none';
  }

  selectedVessels = [];
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedCountEl) selectedCountEl.textContent = '0';

  if (successCount > 0 && failCount === 0) {
    showFeedback(`✓ Successfully purchased all ${successCount} vessel(s)!`, 'success');
  }

  if (successCount > 0 && window.updateVesselCount) {
    await updateVesselCount();
  }

  await loadAcquirableVessels();
}

export function setVesselFilter(filter) {
  currentVesselFilter = filter;
  selectedEngineType = null;
}

export function getVesselFilter() {
  return currentVesselFilter;
}
