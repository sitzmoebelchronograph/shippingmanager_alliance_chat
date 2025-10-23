/**
 * @fileoverview Utility Functions Module - Provides essential helper functions for HTML escaping, formatting,
 * notifications, feedback dialogs, service worker management, and settings persistence.
 *
 * Key Categories:
 * - HTML & Formatting: escapeHtml, formatNumber, renderStars
 * - User Feedback: showFeedback, showPriceAlert, dismissPriceAlert
 * - Notifications: Browser/desktop notifications with service worker support
 * - Service Worker: Registration and notification handling
 * - Settings: Load/save to server, AutoPilot detection, page title updates
 * - Tooltips: Custom tooltip system
 *
 * Notification Strategy:
 * - Attempts direct Notification API first (works in most browsers)
 * - Falls back to service worker notifications if direct fails
 * - Graceful degradation with error messages
 * - Auto-closes after 5 seconds
 *
 * Settings Persistence:
 * - Stored on server (not localStorage) for multi-device sync
 * - Loaded on app initialization
 * - Saved on every settings change
 *
 * @module utils
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Converts &, <, >, ", and ' to their HTML entity equivalents.
 *
 * This is critical for security when displaying user-generated content like
 * chat messages, company names, or any data from the API.
 *
 * @param {string} text - Raw text to escape
 * @returns {string} HTML-safe escaped text
 *
 * @example
 * escapeHtml('<script>alert("XSS")</script>');
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
export function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Formats numbers with thousands separators and optional decimal places.
 * Uses US locale formatting (comma as thousands separator, period as decimal).
 *
 * @param {number} num - Number to format
 * @returns {string} Formatted number string (e.g., "1,234,567.89")
 *
 * @example
 * formatNumber(1234567.89); // Returns: "1,234,567.89"
 * formatNumber(1000);       // Returns: "1,000"
 */
export function formatNumber(num) {
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Displays a temporary feedback message in the global feedback area.
 * Supports stacking multiple messages and auto-dismiss after 6 seconds.
 *
 * Message Types:
 * - 'success': Green background (successful operations)
 * - 'error': Red background (failures, warnings)
 * - 'warning': Orange/yellow background (cautions)
 *
 * Stacking Behavior:
 * - If price alert is showing, appends feedback below it
 * - Otherwise replaces existing feedback
 * - Allows multiple feedback messages to stack
 *
 * Side Effects:
 * - Creates/updates DOM element in global feedback area
 * - Auto-dismisses after 6 seconds
 * - Adds close button for manual dismiss
 *
 * @param {string} message - Message text (can include HTML)
 * @param {string} type - Message type: 'success', 'error', or 'warning'
 *
 * @example
 * showFeedback('Vessel purchased successfully!', 'success');
 * showFeedback('Not enough cash!', 'error');
 */
export function showFeedback(message, type) {
  const globalFeedback = document.getElementById('globalFeedback');

  const hasPriceAlert = globalFeedback.querySelector('#priceAlertMessage');

  if (hasPriceAlert) {
    // Price alert exists - add feedback message below it without clearing anything
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = `global-feedback-message ${type}`;
    feedbackDiv.style.position = 'relative';
    feedbackDiv.style.marginTop = '10px';
    feedbackDiv.innerHTML = `
      ${message}
      <button onclick="this.parentElement.remove()" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: rgba(255,255,255,0.6); font-size: 18px; cursor: pointer; padding: 0; width: 20px; height: 20px; line-height: 18px; transition: color 0.2s;" onmouseover="this.style.color='rgba(255,255,255,1)'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">×</button>
    `;
    globalFeedback.appendChild(feedbackDiv);

    // Auto-remove only this feedback message after 6 seconds
    setTimeout(() => {
      if (feedbackDiv.parentNode) {
        feedbackDiv.remove();
      }
    }, 6000);
  } else {
    // No price alert - show feedback as usual
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = `global-feedback-message ${type}`;
    feedbackDiv.style.position = 'relative';
    feedbackDiv.innerHTML = `
      ${message}
      <button onclick="this.parentElement.remove()" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: rgba(255,255,255,0.6); font-size: 18px; cursor: pointer; padding: 0; width: 20px; height: 20px; line-height: 18px; transition: color 0.2s;" onmouseover="this.style.color='rgba(255,255,255,1)'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">×</button>
    `;
    globalFeedback.innerHTML = '';
    globalFeedback.appendChild(feedbackDiv);
    globalFeedback.style.display = 'block';

    // Auto-remove after 6 seconds
    setTimeout(() => {
      if (feedbackDiv.parentNode) {
        feedbackDiv.remove();
        // Hide container if empty
        if (globalFeedback.children.length === 0) {
          globalFeedback.style.display = 'none';
        }
      }
    }, 6000);
  }
}

/**
 * Timeout ID for price alert auto-dismiss.
 * Used to clear timeout when alert is manually dismissed.
 * @type {number|null}
 */
let priceAlertTimeout = null;

/**
 * Displays a persistent price alert with animated entrance and manual dismiss button.
 * Used for important alerts like fuel/CO2 price drops and campaign warnings.
 *
 * Alert Behavior:
 * - Shows with spinning animation entrance
 * - Stays visible for 29 minutes (1,740,000ms) for long-term awareness
 * - Requires manual dismiss via "Got it" button
 * - Only one price alert at a time (replaces existing)
 *
 * Animation:
 * - Scales from 0 to 1 while rotating 360 degrees
 * - Uses cubic-bezier easing for bounce effect
 * - Duration: 800ms
 *
 * Side Effects:
 * - Clears any existing price alert timeout
 * - Replaces global feedback area content
 * - Sets 29-minute auto-dismiss timeout
 *
 * @param {string} message - Alert message (can include HTML)
 * @param {string} [type='warning'] - Alert type: 'warning', 'success', 'error'
 *
 * @example
 * showPriceAlert('⛽ Fuel price dropped to $350/ton!', 'warning');
 */
export function showPriceAlert(message, type = 'warning') {
  const globalFeedback = document.getElementById('globalFeedback');

  if (!globalFeedback) {
    console.error('[showPriceAlert] globalFeedback element not found!');
    return;
  }

  if (priceAlertTimeout) {
    clearTimeout(priceAlertTimeout);
  }

  globalFeedback.innerHTML = `
    <div class="global-feedback-message ${type}" id="priceAlertMessage" style="transform: scale(0) rotate(0deg); opacity: 0;">
      <div style="width: 100%;">${message}</div>
      <button
        id="dismissPriceAlertBtn"
        style="display: block; margin: 0 auto; padding: 8px 20px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: white; cursor: pointer; font-weight: 600; transition: all 0.2s;"
        onmouseover="this.style.background='rgba(255,255,255,0.3)'"
        onmouseout="this.style.background='rgba(255,255,255,0.2)'"
      >
        Got it
      </button>
    </div>
  `;

  globalFeedback.style.display = 'block';

  const messageEl = document.getElementById('priceAlertMessage');
  messageEl.offsetHeight;

  messageEl.animate([
    { transform: 'scale(0) rotate(0deg)', opacity: 0 },
    { transform: 'scale(0.5) rotate(180deg)', opacity: 1, offset: 0.6 },
    { transform: 'scale(1) rotate(360deg)', opacity: 1 }
  ], {
    duration: 800,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    fill: 'forwards'
  });

  const dismissBtn = document.getElementById('dismissPriceAlertBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissPriceAlert();
    });
  }

  // Auto-dismiss after 30 seconds, but pause timer when mouse is over the message
  let timeRemaining = 30000; // 30 seconds
  let lastTimestamp = Date.now();
  let isMouseOver = false;

  const startAutoDismissTimer = () => {
    if (timeRemaining <= 0) {
      // Timer expired while mouse was over - don't restart
      return;
    }
    priceAlertTimeout = setTimeout(() => {
      if (!isMouseOver) {
        dismissPriceAlert();
      }
    }, timeRemaining);
  };

  messageEl.addEventListener('mouseenter', () => {
    isMouseOver = true;
    // Pause timer - calculate remaining time
    if (priceAlertTimeout) {
      clearTimeout(priceAlertTimeout);
      const elapsed = Date.now() - lastTimestamp;
      timeRemaining -= elapsed;
      if (timeRemaining < 0) timeRemaining = 0; // Stop at 0
    }
  });

  messageEl.addEventListener('mouseleave', () => {
    isMouseOver = false;
    // Resume timer with remaining time (only if time remaining > 0)
    if (timeRemaining > 0) {
      lastTimestamp = Date.now();
      startAutoDismissTimer();
    }
  });

  // Start initial timer
  lastTimestamp = Date.now();
  startAutoDismissTimer();
}

export function dismissPriceAlert() {
  const globalFeedback = document.getElementById('globalFeedback');

  if (priceAlertTimeout) {
    clearTimeout(priceAlertTimeout);
    priceAlertTimeout = null;
  }

  globalFeedback.style.display = 'none';
  globalFeedback.innerHTML = '';
}

/**
 * Renders a reputation score as star rating with partial stars.
 * Converts percentage (0-100) to 5-star display with gradient for partial stars.
 *
 * Star Calculation:
 * - Full stars: floor(percentage / 20)
 * - Partial star: remainder as percentage gradient
 * - Empty stars: remaining to reach 5 total
 *
 * Colors:
 * - Filled: Gold (#fbbf24)
 * - Empty: Gray transparent (rgba(156, 163, 175, 0.2))
 *
 * @param {number} percentage - Reputation percentage (0-100)
 * @returns {string} HTML string with star emojis and styling
 *
 * @example
 * renderStars(73); // Returns: 3.65 stars (3 full, 1 partial at 65%, 1 empty)
 */
export function renderStars(percentage) {
  const fullStars = Math.floor(percentage / 20);
  const remainder = percentage % 20;
  const partialPercent = (remainder / 20) * 100;
  const emptyStars = 5 - fullStars - (remainder > 0 ? 1 : 0);

  let stars = '';

  for (let i = 0; i < fullStars; i++) {
    stars += '<span style="color: #fbbf24;">⭐</span>';
  }

  if (remainder > 0) {
    stars += `
      <span style="
        background: linear-gradient(to right, #fbbf24 0%, #fbbf24 ${partialPercent}%, rgba(156, 163, 175, 0.2) ${partialPercent}%, rgba(156, 163, 175, 0.2) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      ">⭐</span>
    `;
  }

  for (let i = 0; i < emptyStars; i++) {
    stars += '<span style="color: rgba(156, 163, 175, 0.2);">⭐</span>';
  }

  return stars;
}

/**
 * Requests browser notification permission from the user.
 * Checks current permission status and prompts if not yet decided.
 *
 * Permission States:
 * - 'granted': Already have permission, returns true
 * - 'denied': User denied, returns false (cannot re-request)
 * - 'default': Not yet asked, prompts user
 *
 * @async
 * @returns {Promise<boolean>} True if permission granted, false otherwise
 */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

/**
 * Service worker registration object.
 * Used for showing notifications via service worker API when direct API fails.
 * @type {ServiceWorkerRegistration|null}
 */
let swRegistration = null;

/**
 * Registers service worker for notification support and offline capabilities.
 * Handles installation, waiting, and activation states for proper service worker lifecycle.
 *
 * Service Worker Purpose:
 * - Enables notifications in browsers that don't support direct Notification API
 * - Provides fallback for notification display
 * - Required for showing notifications when page is not focused
 *
 * Lifecycle Handling:
 * - Waits for installing worker to activate
 * - Skips waiting for waiting worker
 * - Logs status of already-active worker
 *
 * Side Effects:
 * - Registers /sw.js service worker
 * - Updates module-level swRegistration variable
 * - Logs registration status to console
 *
 * @async
 * @returns {Promise<ServiceWorkerRegistration|null>} Service worker registration or null if not supported
 */
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');

      if (swRegistration.installing) {
        await new Promise((resolve) => {
          swRegistration.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              resolve();
            }
          });
        });
      } else if (swRegistration.waiting) {
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      return swRegistration;
    } catch (error) {
      console.error('[Service Worker] Registration failed:', error);
      return null;
    }
  }
  return null;
}

/**
 * Shows a browser/desktop notification with fallback strategies.
 * Attempts direct Notification API first, falls back to service worker if needed.
 *
 * Notification Strategy:
 * 1. Try creating notification directly (works in most browsers)
 * 2. If direct fails, use service worker showNotification (background support)
 * 3. If both fail, show error price alert
 *
 * Default Enhancements:
 * - Vibration pattern: [200ms, 100ms pause, 200ms]
 * - Badge: Anchor emoji
 * - Click handler: Focus window and close notification
 * - Auto-close after 5 seconds (unless autoClose: false)
 *
 * @async
 * @param {string} title - Notification title
 * @param {Object} options - Notification options
 * @param {string} [options.body] - Notification body text
 * @param {string} [options.icon] - Icon URL or data URI
 * @param {string} [options.tag] - Unique tag for notification grouping
 * @param {boolean} [options.silent=false] - Silent notification
 * @param {boolean} [options.autoClose=true] - Auto-close after 5 seconds
 * @param {Object} [options.data] - Custom data attached to notification
 * @returns {Promise<boolean>} True if notification shown successfully
 * @throws {Error} Shows error price alert on failure
 *
 * @example
 * showNotification('Fuel Price Alert', {
 *   body: 'Fuel dropped to $350/ton',
 *   icon: '/favicon.ico',
 *   tag: 'fuel-alert'
 * });
 */
export async function showNotification(title, options) {
  if (Notification.permission !== 'granted') {
    return false;
  }

  const enhancedOptions = {
    ...options,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⚓</text></svg>"
  };

  try {
    try {
      const notification = new Notification(title, enhancedOptions);
      notification.onclick = function() {
        window.focus();
        notification.close();
      };
      if (options.autoClose !== false) {
        setTimeout(() => notification.close(), 5000);
      }
      return true;
    } catch (directError) {
      if (swRegistration && swRegistration.active) {
        await swRegistration.showNotification(title, enhancedOptions);
        return true;
      } else {
        throw new Error('Service Worker not ready. Please reload the page.');
      }
    }
  } catch (error) {
    showPriceAlert(`❌ Notification Error<br><br>${error.message}`, 'error');
    throw error;
  }
}

export async function showChatNotification(title, message) {
  if (Notification.permission === "granted" && document.hidden) {
    await showNotification(title, {
      body: message,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⚓</text></svg>",
      tag: "shipping-manager-chat",
      silent: false,
      data: { action: 'focus-chat' }
    });
  }
}

export function handleNotifications(newMessages) {
  if (document.hidden) {
    newMessages.forEach(msg => {
      if (msg.type === 'chat') {
        showChatNotification(
          `💬 ${msg.company}`,
          msg.message.substring(0, 100) + (msg.message.length > 100 ? '...' : '')
        );
      } else if (msg.type === 'feed') {
        showChatNotification(
          '📢 Alliance Event',
          `${msg.feedType}: ${msg.company}`
        );
      }
    });
  }
}

// --- Tooltip System ---

export function initCustomTooltips() {
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  document.body.appendChild(tooltip);

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[title]');
    if (target && target.hasAttribute('title')) {
      const title = target.getAttribute('title');
      if (!title) return;

      target.setAttribute('data-title', title);
      target.removeAttribute('title');

      tooltip.textContent = title;
      tooltip.classList.add('show');

      const moveTooltip = (event) => {
        const x = event.clientX;
        const y = event.clientY;
        const tooltipRect = tooltip.getBoundingClientRect();

        let left = x + 10;
        let top = y + 10;

        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 10;
        }

        if (top + tooltipRect.height > window.innerHeight) {
          top = y - tooltipRect.height - 10;
        }

        if (left < 10) {
          left = 10;
        }

        if (top < 10) {
          top = 10;
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      };

      moveTooltip(e);
      target.addEventListener('mousemove', moveTooltip);

      const hideTooltip = () => {
        tooltip.classList.remove('show');
        target.removeEventListener('mousemove', moveTooltip);
        target.removeEventListener('mouseout', hideTooltip);

        if (target.hasAttribute('data-title')) {
          target.setAttribute('title', target.getAttribute('data-title'));
          target.removeAttribute('data-title');
        }
      };

      target.addEventListener('mouseout', hideTooltip);
    }
  });
}

// --- Settings Functions ---

export async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    const settings = await response.json();
    return settings;
  } catch (error) {
    console.error('Error loading settings from server:', error);
    // Return default settings if server request fails
    return {
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
      autoCampaignRenewal: false,
      autoPilotNotifications: false
    };
  }
}

export async function saveSettings(settings) {
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      throw new Error('Failed to save settings');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving settings to server:', error);
    showFeedback('Failed to save settings', 'error');
    throw error;
  }
}

export function isAutoPilotActive(settings) {
  return settings.autoRebuyFuel ||
         settings.autoRebuyCO2 ||
         settings.autoDepartAll ||
         settings.autoBulkRepair ||
         settings.autoCampaignRenewal;
}

export function updatePageTitle(settings) {
  const autoPilotActive = isAutoPilotActive(settings);

  const browserTabTitle = autoPilotActive
    ? '⚓ Shipping Manager - ✨AutoPilot✨'
    : '⚓ Shipping Manager - CoPilot';

  // Update browser tab title
  document.title = browserTabTitle;

  // Update page header with shiny effect ONLY on "AutoPilot" word
  const headerElement = document.getElementById('pageHeaderTitle');
  if (headerElement) {
    if (autoPilotActive) {
      // Split text so only "AutoPilot" has the shiny effect
      headerElement.innerHTML = 'Shipping Manager - <span class="autopilot-active">AutoPilot</span>';
    } else {
      headerElement.textContent = 'Shipping Manager - CoPilot';
    }
  }

  // Show/hide notifications checkbox based on AutoPilot status
  const notificationsContainer = document.getElementById('autoPilotNotificationsContainer');
  const notificationsCheckbox = document.getElementById('autoPilotNotifications');

  if (notificationsContainer) {
    if (autoPilotActive) {
      notificationsContainer.style.display = 'block';
    } else {
      notificationsContainer.style.display = 'none';
      if (notificationsCheckbox && notificationsCheckbox.checked) {
        notificationsCheckbox.checked = false;
        settings.autoPilotNotifications = false;
        saveSettings(settings);
      }
    }
  }
}
