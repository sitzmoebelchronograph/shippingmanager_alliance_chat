/**
 * @fileoverview Alliance Cooperation Management
 *
 * Handles alliance coop vessel management including:
 * - Fetching coop data and statistics
 * - Displaying member list with coop information
 * - Managing coop vessel sends (placeholder for future implementation)
 *
 * @module coop
 * @requires utils - Formatting and feedback functions
 */

import { formatNumber, escapeHtml, showFeedback } from './utils.js';

/**
 * Fetches coop data from the backend API
 *
 * @async
 * @returns {Promise<Object>} Coop data object
 * @throws {Error} If fetch fails
 */
export async function fetchCoopData() {
  try {
    const response = await fetch('/api/coop/data');
    if (!response.ok) throw new Error('Failed to fetch coop data');
    return await response.json();
  } catch (error) {
    console.error('[Coop] Error fetching data:', error);
    throw error;
  }
}

/**
 * Updates the coop badge display (shows available count only if > 0)
 * Also updates the header display with available/cap format
 *
 * @async
 * @returns {Promise<void>}
 */
export async function updateCoopBadge() {
  try {
    const data = await fetchCoopData();
    const coop = data.data?.coop;

    if (!coop) {
      console.error('[Coop] No coop data in response');
      return;
    }

    // Update button badge (only show if available > 0)
    const badge = document.getElementById('coopBadge');
    if (badge) {
      if (coop.available > 0) {
        badge.textContent = `${coop.available}`;
        badge.style.display = 'block';

        // Change color based on availability
        if (coop.available < coop.cap * 0.25) {
          badge.style.background = '#f97316'; // Orange
        } else {
          badge.style.background = '#10b981'; // Green
        }
      } else {
        // Hide badge when 0 available (all sent)
        badge.style.display = 'none';
      }
    }

    // Update header display (always show available/cap)
    const headerDisplay = document.getElementById('coopDisplay');
    if (headerDisplay) {
      headerDisplay.textContent = `${coop.available}/${coop.cap}`;

      // Color based on availability (0 = good, all sent = green)
      if (coop.available === 0) {
        headerDisplay.style.color = '#10b981'; // Green - all sent (good!)
      } else if (coop.available < coop.cap * 0.25) {
        headerDisplay.style.color = '#f97316'; // Orange - almost done
      } else {
        headerDisplay.style.color = '#ef4444'; // Red - still many to send
      }
    }
  } catch (error) {
    console.error('[Coop] Error updating badge:', error);
  }
}

/**
 * Shows the coop overlay with member list
 *
 * @async
 * @returns {Promise<void>}
 */
export async function showCoopOverlay() {
  const overlay = document.getElementById('coopOverlay');
  const content = document.getElementById('coopContent');

  if (!overlay || !content) {
    console.error('[Coop] Overlay elements not found');
    return;
  }

  try {
    const data = await fetchCoopData();
    const coop = data.data?.coop;
    const members = data.data?.members_coop || [];

    if (!coop) {
      content.innerHTML = '<p style="color: #ef4444;">Failed to load coop data</p>';
      overlay.style.display = 'flex';
      return;
    }

    // Filter only enabled members
    const enabledMembers = members.filter(m => m.enabled === true);

    let html = `
      <div style="margin-bottom: 20px; padding: 15px; background: rgba(31, 41, 55, 0.5); border-radius: 8px;">
        <h3 style="margin: 0 0 10px 0; color: #e0e0e0;">Your Coop Stats</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 14px;">
          <div>
            <span style="color: #9ca3af;">Available:</span>
            <span style="color: #10b981; font-weight: bold; margin-left: 8px;">${coop.available}</span>
          </div>
          <div>
            <span style="color: #9ca3af;">Cap:</span>
            <span style="color: #e0e0e0; font-weight: bold; margin-left: 8px;">${coop.cap}</span>
          </div>
          <div>
            <span style="color: #9ca3af;">Sent this season:</span>
            <span style="color: #60a5fa; font-weight: bold; margin-left: 8px;">${coop.sent_this_season}</span>
          </div>
          <div>
            <span style="color: #9ca3af;">Received this season:</span>
            <span style="color: #a78bfa; font-weight: bold; margin-left: 8px;">${coop.received_this_season}</span>
          </div>
        </div>
      </div>

      <h3 style="margin: 0 0 15px 0; color: #e0e0e0;">Alliance Members (${enabledMembers.length} active)</h3>
    `;

    if (enabledMembers.length === 0) {
      html += '<p style="color: #9ca3af; text-align: center; padding: 40px;">No active members available for coop</p>';
    } else {
      // Sort by total vessels descending
      enabledMembers.sort((a, b) => b.total_vessels - a.total_vessels);

      enabledMembers.forEach(member => {
        const fuelFormatted = formatNumber(member.fuel);
        const isPurchaser = member.has_real_purchase;

        html += `
          <div style="margin-bottom: 12px; padding: 12px; background: rgba(31, 41, 55, 0.3); border-radius: 8px; border-left: 3px solid ${isPurchaser ? '#10b981' : '#404040'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <div style="color: #e0e0e0; font-weight: 500; margin-bottom: 4px;">
                  User ${member.user_id} ${isPurchaser ? '✓' : ''}
                </div>
                <div style="font-size: 12px; color: #9ca3af;">
                  ⛴️ ${member.total_vessels} vessels | ⛽ ${fuelFormatted}t fuel
                </div>
              </div>
              <button
                onclick="window.sendCoopMax(${member.user_id})"
                style="
                  padding: 8px 16px;
                  background: rgba(16, 185, 129, 0.2);
                  border: 1px solid rgba(16, 185, 129, 0.3);
                  border-radius: 6px;
                  color: #10b981;
                  font-weight: 500;
                  cursor: pointer;
                  transition: all 0.2s;
                "
                onmouseover="this.style.background='rgba(16, 185, 129, 0.3)'"
                onmouseout="this.style.background='rgba(16, 185, 129, 0.2)'"
              >
                Send max
              </button>
            </div>
          </div>
        `;
      });
    }

    content.innerHTML = html;
    overlay.style.display = 'flex';

  } catch (error) {
    console.error('[Coop] Error showing overlay:', error);
    content.innerHTML = '<p style="color: #ef4444;">Failed to load coop data. Please try again.</p>';
    overlay.style.display = 'flex';
  }
}

/**
 * Closes the coop overlay
 *
 * @returns {void}
 */
export function closeCoopOverlay() {
  const overlay = document.getElementById('coopOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Placeholder function for sending max coop vessels
 * Will be implemented when API endpoint is provided
 *
 * @param {number} userId - Target user ID
 * @returns {void}
 */
export function sendCoopMax(userId) {
  showFeedback(`Send max coop to user ${userId} - API endpoint not yet implemented`, 'info');
  console.log(`[Coop] Send max to user ${userId} - Placeholder function`);
}
