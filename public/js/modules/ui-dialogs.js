/**
 * @fileoverview UI Dialogs Module - Manages all modal dialogs and overlay interfaces for user interactions.
 * Provides reusable dialog components for confirmations, settings, campaigns, contacts, and vessel/anchor information.
 *
 * Key Features:
 * - Generic confirmation dialog with customizable title, message, and details
 * - Settings overlay for managing price thresholds and AutoPilot options
 * - Marketing campaigns browser with activation functionality
 * - Contact list display with direct messaging integration
 * - Affordability calculations with visual indicators (green/red)
 *
 * Dialog Types:
 * - Confirmation Dialogs: Purchase confirmations, deletion warnings
 * - Settings Panel: Price thresholds, auto-rebuy toggles, AutoPilot features
 * - Campaign Browser: Shows active/inactive campaigns with purchase buttons
 * - Contact List: Filterable list of contacts and alliance members
 * - Info Dialogs: Anchor status, vessel information
 *
 * @module ui-dialogs
 * @requires utils - Formatting and feedback functions
 * @requires api - Backend API calls for data fetching
 */

import { escapeHtml, formatNumber, renderStars, showFeedback, showPriceAlert } from './utils.js';
import { fetchCampaigns, activateCampaign, fetchContacts } from './api.js';

/**
 * Shows a customizable confirmation dialog with optional details table.
 * Returns a promise that resolves to true/false based on user choice.
 *
 * Features:
 * - Custom title and message
 * - Optional details table with label/value pairs
 * - Affordability check (highlights Total Cost vs Available Cash)
 * - Customizable button text
 * - Click-outside-to-close functionality
 *
 * Affordability Logic:
 * - If second-to-last row is "Total Cost" and last row is "Available Cash"
 * - Compares values numerically
 * - Adds 'affordable' (green) or 'too-expensive' (red) CSS class
 *
 * @param {Object} options - Configuration options
 * @param {string} options.title - Dialog title
 * @param {string} [options.message] - Main message text
 * @param {Array<{label: string, value: string}>} [options.details] - Details table rows
 * @param {string} [options.confirmText='Confirm'] - Confirm button text
 * @param {string} [options.cancelText='Cancel'] - Cancel button text (empty string to hide)
 * @returns {Promise<boolean>} True if confirmed, false if canceled or closed
 *
 * @example
 * const confirmed = await showConfirmDialog({
 *   title: 'Purchase Fuel',
 *   message: 'Buy fuel to fill tank?',
 *   confirmText: 'Buy',
 *   details: [
 *     { label: 'Amount needed', value: '2,500t' },
 *     { label: 'Total Cost', value: '$1,000,000' },
 *     { label: 'Available Cash', value: '$5,000,000' }
 *   ]
 * });
 */
export function showConfirmDialog(options) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    const detailsHtml = options.details ? `
      <div class="confirm-dialog-details">
        ${options.details.map((detail, index) => {
          const isSecondToLastRow = index === options.details.length - 2;

          let rowClass = '';
          if (isSecondToLastRow && detail.label === 'Total Cost') {
            const totalCostMatch = detail.value.match(/[\d,]+/);
            const availableCashMatch = options.details[options.details.length - 1].value.match(/[\d,]+/);

            if (totalCostMatch && availableCashMatch) {
              const totalCost = parseInt(totalCostMatch[0].replace(/,/g, ''));
              const availableCash = parseInt(availableCashMatch[0].replace(/,/g, ''));
              rowClass = availableCash >= totalCost ? ' affordable' : ' too-expensive';
            }
          }

          return `
            <div class="confirm-dialog-detail-row${rowClass}">
              <span class="label">${escapeHtml(detail.label)}</span>
              <span class="value">${escapeHtml(detail.value)}</span>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    const cancelButtonHtml = options.cancelText !== ''
      ? `<button class="confirm-dialog-btn cancel" data-action="cancel">${escapeHtml(options.cancelText || 'Cancel')}</button>`
      : '';

    dialog.innerHTML = `
      <div class="confirm-dialog-header">
        <h3>${escapeHtml(options.title || 'Confirm')}</h3>
        <div class="confirm-dialog-buttons">
          ${cancelButtonHtml}
          <button class="confirm-dialog-btn confirm" data-action="confirm">${escapeHtml(options.confirmText || 'Confirm')}</button>
        </div>
      </div>
      <div class="confirm-dialog-body">
        ${options.message ? `<p>${options.message}</p>` : ''}
        ${detailsHtml}
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const handleClick = (e) => {
      const action = e.target.dataset.action;
      if (action === 'confirm' || action === 'cancel') {
        document.body.removeChild(overlay);
        resolve(action === 'confirm');
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    });

    dialog.addEventListener('click', handleClick);
  });
}

/**
 * Displays the settings overlay with current settings populated in form fields.
 * Manages price thresholds and AutoPilot configuration interface.
 *
 * Settings Categories:
 * - Price Thresholds: Fuel, CO2, Maintenance alerts
 * - Auto-Rebuy: Automated fuel/CO2 purchasing with customizable triggers
 * - AutoPilot Features: Auto-depart, auto-repair, auto-campaigns
 * - Notifications: AutoPilot action notifications
 *
 * Dynamic UI Behavior:
 * - Auto-rebuy sections expand/collapse based on toggle state
 * - Threshold inputs lock when "Use Alert Price" is enabled
 * - Notifications checkbox only visible when AutoPilot features active
 *
 * Side Effects:
 * - Shows settings overlay
 * - Populates form fields from settings object
 * - Sets up conditional UI visibility
 *
 * @param {Object} settings - Current settings object
 * @param {number} settings.fuelThreshold - Fuel price alert threshold in $/ton
 * @param {number} settings.co2Threshold - CO2 price alert threshold in $/ton
 * @param {number} settings.maintenanceThreshold - Wear percentage for repair alerts
 * @param {boolean} settings.autoRebuyFuel - Enable auto-fuel purchasing
 * @param {boolean} settings.autoRebuyCO2 - Enable auto-CO2 purchasing
 * @param {boolean} settings.autoDepartAll - Enable auto-depart on ready vessels
 * @param {boolean} settings.autoBulkRepair - Enable auto-repair at threshold
 * @param {boolean} settings.autoCampaignRenewal - Enable auto-campaign renewal
 * @param {boolean} settings.autoPilotNotifications - Show notifications for AutoPilot actions
 */
export function showSettings(settings) {
  document.getElementById('fuelThreshold').value = settings.fuelThreshold;
  document.getElementById('co2Threshold').value = settings.co2Threshold;
  document.getElementById('maintenanceThreshold').value = settings.maintenanceThreshold;

  // Auto-Rebuy Fuel
  document.getElementById('autoRebuyFuel').checked = settings.autoRebuyFuel || false;
  document.getElementById('autoRebuyFuelOptions').style.display = settings.autoRebuyFuel ? 'block' : 'none';

  const fuelUseAlert = settings.autoRebuyFuelUseAlert !== undefined ? settings.autoRebuyFuelUseAlert : true;
  document.getElementById('autoRebuyFuelUseAlert').checked = fuelUseAlert;

  const fuelThresholdInput = document.getElementById('autoRebuyFuelThreshold');
  if (fuelUseAlert) {
    fuelThresholdInput.value = settings.fuelThreshold;
    fuelThresholdInput.disabled = true;
    fuelThresholdInput.style.opacity = '0.5';
    fuelThresholdInput.style.cursor = 'not-allowed';
  } else {
    fuelThresholdInput.value = settings.autoRebuyFuelThreshold || 400;
    fuelThresholdInput.disabled = false;
    fuelThresholdInput.style.opacity = '1';
    fuelThresholdInput.style.cursor = 'text';
  }

  // Auto-Rebuy CO2
  document.getElementById('autoRebuyCO2').checked = settings.autoRebuyCO2 || false;
  document.getElementById('autoRebuyCO2Options').style.display = settings.autoRebuyCO2 ? 'block' : 'none';

  const co2UseAlert = settings.autoRebuyCO2UseAlert !== undefined ? settings.autoRebuyCO2UseAlert : true;
  document.getElementById('autoRebuyCO2UseAlert').checked = co2UseAlert;

  const co2ThresholdInput = document.getElementById('autoRebuyCO2Threshold');
  if (co2UseAlert) {
    co2ThresholdInput.value = settings.co2Threshold;
    co2ThresholdInput.disabled = true;
    co2ThresholdInput.style.opacity = '0.5';
    co2ThresholdInput.style.cursor = 'not-allowed';
  } else {
    co2ThresholdInput.value = settings.autoRebuyCO2Threshold || 7;
    co2ThresholdInput.disabled = false;
    co2ThresholdInput.style.opacity = '1';
    co2ThresholdInput.style.cursor = 'text';
  }

  document.getElementById('autoDepartAll').checked = settings.autoDepartAll || false;
  document.getElementById('autoBulkRepair').checked = settings.autoBulkRepair || false;
  document.getElementById('autoCampaignRenewal').checked = settings.autoCampaignRenewal || false;
  document.getElementById('autoPilotNotifications').checked = settings.autoPilotNotifications || false;
  document.getElementById('settingsOverlay').style.display = 'flex';
}

/**
 * Closes the settings overlay.
 */
export function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none';
}

/**
 * Displays marketing campaigns overlay with active campaigns and purchase options.
 * Shows company reputation stars and allows activating campaigns for reputation, awareness, and green.
 *
 * Campaign Display:
 * - Active campaigns shown with time remaining
 * - Inactive campaigns grouped by type with purchase buttons
 * - Reputation score displayed as star rating
 * - Duration and efficiency shown for each option
 *
 * Side Effects:
 * - Fetches campaign data from API
 * - Shows campaigns overlay
 * - Renders HTML with inline event handlers for purchase buttons
 *
 * @async
 * @returns {Promise<void>}
 */
export async function showCampaignsOverlay() {
  try {
    const data = await fetchCampaigns();
    const allCampaigns = data.data.marketing_campaigns || [];
    const activeCampaigns = data.data.active_campaigns || [];
    const activeTypes = new Set(activeCampaigns.map(c => c.option_name));
    const totalReputation = data.user.reputation || 0;

    const contentDiv = document.getElementById('campaignsContent');
    const requiredTypes = ['reputation', 'awareness', 'green'];

    let html = '';

    html += `
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 10px;">
          Company Reputation
        </div>
        <div style="font-size: 32px; margin-bottom: 8px; line-height: 1;">
          ${renderStars(totalReputation)}
        </div>
        <div style="font-size: 18px; color: #10b981; font-weight: 600;">
          ${totalReputation}%
        </div>
      </div>
    `;

    if (activeCampaigns.length > 0) {
      html += `
        <div style="margin-bottom: 30px;">
          <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #10b981;">
            ✅ Active Campaigns
          </h3>
          <div style="display: flex; flex-direction: column; gap: 10px;">
      `;

      activeCampaigns.forEach(campaign => {
        const typeName = campaign.option_name.charAt(0).toUpperCase() + campaign.option_name.slice(1);
        const typeIcon = campaign.option_name === 'reputation' ? '⭐' : campaign.option_name === 'awareness' ? '📢' : '🌱';
        const efficiency = `${campaign.increase}%`;
        const duration = campaign.duration;

        const now = Math.floor(Date.now() / 1000);
        const timeLeft = campaign.end_time - now;
        const hoursLeft = Math.floor(timeLeft / 3600);
        const minutesLeft = Math.floor((timeLeft % 3600) / 60);
        const timeLeftStr = `${hoursLeft}h ${minutesLeft}m`;

        html += `
          <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="color: #10b981; font-size: 14px; font-weight: 600;">
                ${typeIcon} ${typeName}
              </div>
              <div style="color: #10b981; font-size: 12px; font-weight: 600;">
                ${timeLeftStr} remaining
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; color: #9ca3af; font-size: 12px;">
              <span>Duration: ${duration}h</span>
              <span>Efficiency: ${efficiency}</span>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    const inactiveTypes = requiredTypes.filter(type => !activeTypes.has(type));

    if (inactiveTypes.length > 0) {
      inactiveTypes.forEach(type => {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        const typeIcon = type === 'reputation' ? '⭐' : type === 'awareness' ? '📢' : '🌱';
        const typeCampaigns = allCampaigns.filter(c => c.option_name === type);

        html += `
          <div style="margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #e0e0e0;">
              ${typeIcon} ${typeName} Campaigns
            </h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
        `;

        typeCampaigns.forEach(campaign => {
          const duration = campaign.campaign_duration;
          const efficiency = `${campaign.min_efficiency}-${campaign.max_efficiency}%`;
          const price = formatNumber(campaign.price);

          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(31, 41, 55, 0.5); border-radius: 8px; gap: 15px;">
              <div style="flex: 1;">
                <div style="color: #e0e0e0; font-size: 14px; font-weight: 600; margin-bottom: 4px;">
                  ${duration}h Duration
                </div>
                <div style="color: #9ca3af; font-size: 12px;">
                  Efficiency: ${efficiency}
                </div>
              </div>
              <div style="text-align: right; margin-right: 10px;">
                <div style="color: #4ade80; font-size: 14px; font-weight: 600;">
                  $${price}
                </div>
              </div>
              <button
                onclick="window.buyCampaign(${campaign.id}, '${typeName}', ${duration}, ${campaign.price})"
                style="
                  padding: 8px 16px;
                  background: rgba(16, 185, 129, 0.2);
                  border: 1px solid rgba(16, 185, 129, 0.4);
                  border-radius: 6px;
                  color: #10b981;
                  cursor: pointer;
                  font-weight: 600;
                  font-size: 13px;
                  transition: all 0.2s;
                  white-space: nowrap;
                "
                onmouseover="this.style.background='rgba(16, 185, 129, 0.3)'"
                onmouseout="this.style.background='rgba(16, 185, 129, 0.2)'"
              >
                Buy
              </button>
            </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });
    }

    contentDiv.innerHTML = html;
    document.getElementById('campaignsOverlay').style.display = 'flex';
  } catch (error) {
    console.error('Error showing campaigns overlay:', error);
    showFeedback('Failed to load campaigns', 'error');
  }
}

/**
 * Closes the campaigns overlay.
 */
export function closeCampaignsOverlay() {
  document.getElementById('campaignsOverlay').style.display = 'none';
}

/**
 * Initiates marketing campaign purchase with confirmation dialog.
 * Shows cost breakdown and activates campaign upon confirmation.
 *
 * @async
 * @param {number} campaignId - Campaign ID to activate
 * @param {string} typeName - Campaign type name (Reputation/Awareness/Green)
 * @param {number} duration - Campaign duration in hours
 * @param {number} price - Campaign cost in dollars
 * @param {Object} [updateCallbacks] - Optional callbacks for UI updates
 * @param {Function} updateCallbacks.updateCampaignsStatus - Refresh campaigns status
 * @param {Function} updateCallbacks.updateBunkerStatus - Refresh cash display
 * @returns {Promise<void>}
 */
export async function buyCampaign(campaignId, typeName, duration, price, updateCallbacks) {
  const confirmed = await showConfirmDialog({
    title: '📊 Activate Campaign',
    message: `Do you want to activate this ${typeName} campaign?`,
    confirmText: 'Activate',
    details: [
      { label: 'Type', value: typeName },
      { label: 'Duration', value: `${duration} hours` },
      { label: 'Cost', value: `$${formatNumber(price)}` }
    ]
  });

  if (!confirmed) return;

  try {
    const data = await activateCampaign(campaignId);

    showFeedback(`✅ ${typeName} campaign activated for ${duration} hours!`, 'success');

    closeCampaignsOverlay();
    if (updateCallbacks) {
      await updateCallbacks.updateCampaignsStatus();
      await updateCallbacks.updateBunkerStatus();
    }

  } catch (error) {
    console.error('Error buying campaign:', error);
    showFeedback('Failed to activate campaign', 'error');
  }
}

/**
 * Displays contact list overlay with contacts and alliance members.
 * Allows clicking send button to start new private conversation.
 *
 * Contact Categories:
 * - Personal Contacts: User's saved contacts
 * - Alliance Contacts: Current alliance members
 *
 * Side Effects:
 * - Fetches contacts from API
 * - Shows contact list overlay
 * - Registers click handlers to open messenger
 *
 * @async
 * @returns {Promise<void>}
 */
export async function showContactList() {
  try {
    const data = await fetchContacts();
    const contacts = data.contacts || [];
    const allianceContacts = data.alliance_contacts || [];

    const listContainer = document.getElementById('contactListFeed');

    if (contacts.length === 0 && allianceContacts.length === 0) {
      listContainer.innerHTML = '<div class="empty-message">No contacts found.</div>';
    } else {
      const renderContactList = (contactsList) => {
        return contactsList.map((contact) => {
          const contactName = contact.company_name || `User ${contact.id}`;
          const userId = contact.id;

          return `
            <div class="contact-row">
              <div class="contact-name-cell">
                <span class="contact-name">${escapeHtml(contactName)}</span><span class="contact-id"> (${userId})</span>
              </div>
              <div class="contact-button-cell">
                <button class="contact-send-btn" data-user-id="${userId}" data-company-name="${escapeHtml(contactName)}">
                  📩 Send
                </button>
              </div>
            </div>
          `;
        }).join('');
      };

      let html = '';

      if (contacts.length > 0) {
        html += `
          <div class="contact-section">
            <h3 class="contact-section-title">Contacts</h3>
            <div class="contact-table">
              ${renderContactList(contacts)}
            </div>
          </div>
        `;
      }

      if (allianceContacts.length > 0) {
        html += `
          <div class="contact-section">
            <h3 class="contact-section-title">Alliance Contacts</h3>
            <div class="contact-table">
              ${renderContactList(allianceContacts)}
            </div>
          </div>
        `;
      }

      listContainer.innerHTML = html;

      listContainer.querySelectorAll('.contact-send-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = parseInt(btn.dataset.userId);
          const companyName = btn.dataset.companyName;

          document.getElementById('contactListOverlay').style.display = 'none';
          if (window.openNewChatFromContact) {
            window.openNewChatFromContact(companyName, userId);
          }
        });
      });
    }

    document.getElementById('contactListOverlay').style.display = 'flex';

  } catch (error) {
    console.error('Error loading contact list:', error);
    alert(`Error: ${error.message}`);
  }
}

export function closeContactList() {
  document.getElementById('contactListOverlay').style.display = 'none';
}

export async function showAnchorInfo() {
  const anchorBadge = document.getElementById('anchorCount');
  const vesselsAtAnchor = parseInt(anchorBadge.textContent) || 0;

  await showConfirmDialog({
    title: '⚓ Vessels at Anchor',
    message: `You have ${vesselsAtAnchor} vessel${vesselsAtAnchor === 1 ? '' : 's'} at anchor.\n\nPlease plan routes for your vessels in the game. Once you assign routes, the vessel count will update automatically.`,
    confirmText: 'Got it',
    cancelText: ''
  });
}
