/**
 * @fileoverview Main application entry point for the Shipping Manager web interface.
 *
 * This is the CRITICAL initialization and orchestration module that:
 * - Loads and manages global settings state from the server
 * - Initializes all feature modules (chat, messenger, bunker, vessels, automation)
 * - Sets up 60+ event listeners for UI interactions
 * - Establishes WebSocket connection for real-time updates
 * - Configures auto-refresh intervals with randomized delays for anti-detection
 * - Handles settings synchronization across multiple browser tabs/devices
 * - Exposes global functions for HTML onclick handlers and cross-module access
 *
 * **Architectural Role:**
 * Acts as the dependency injection point and initialization sequencer. All modules
 * are pure functions that receive their dependencies (DOM elements, callbacks, settings)
 * from this central orchestrator. This prevents circular dependencies and makes
 * testing/refactoring easier.
 *
 * **Initialization Sequence:**
 * 1. Load settings from server (blocks until ready)
 * 2. Register service worker for mobile notifications
 * 3. Initialize custom tooltips
 * 4. Attach 60+ event listeners to UI elements
 * 5. Load initial data with 500ms delays between calls (prevents API socket hang-ups)
 * 6. Initialize WebSocket for real-time updates
 * 7. Initialize automation system (AutoPilot features)
 * 8. Start auto-refresh intervals with randomized delays
 *
 * **Anti-Detection Pattern:**
 * Uses randomized intervals (e.g., 25-27s instead of fixed 25s) to avoid triggering
 * server-side bot detection based on perfectly timed API calls.
 *
 * @module script
 * @requires ./modules/utils - Core utilities and settings management
 * @requires ./modules/api - API communication layer
 * @requires ./modules/ui-dialogs - Modal dialogs and overlays
 * @requires ./modules/chat - Alliance chat functionality
 * @requires ./modules/messenger - Private messaging system
 * @requires ./modules/bunker-management - Fuel/CO2 purchasing
 * @requires ./modules/vessel-management - Vessel operations and catalog
 * @requires ./modules/automation - AutoPilot automation system
 */

// Import utilities
import {
  loadSettings,
  saveSettings,
  initCustomTooltips,
  registerServiceWorker,
  requestNotificationPermission,
  showNotification,
  showFeedback,
  showPriceAlert,
  updatePageTitle
} from './modules/utils.js';

// Import API functions
import { fetchAllianceMembers } from './modules/api.js';

// Import UI dialogs
import {
  showSettings,
  closeSettings,
  showCampaignsOverlay,
  closeCampaignsOverlay,
  buyCampaign,
  showContactList,
  closeContactList,
  showAnchorInfo
} from './modules/ui-dialogs.js';

// Import coop management
import {
  updateCoopBadge,
  showCoopOverlay,
  closeCoopOverlay,
  sendCoopMax
} from './modules/coop.js';

// Import chat functionality
import {
  loadMessages,
  sendMessage,
  handleMessageInput,
  loadAllianceMembers,
  initWebSocket,
  setChatScrollListener
} from './modules/chat.js';

// Import messenger functionality
import {
  openMessenger,
  openNewChat,
  closeMessenger,
  closeChatSelection,
  showAllChats,
  closeAllChats,
  updateUnreadBadge,
  sendPrivateMessage,
  getCurrentPrivateChat,
  deleteCurrentChat
} from './modules/messenger.js';

// Import bunker management
import {
  updateBunkerStatus,
  updateCampaignsStatus,
  buyMaxFuel,
  buyMaxCO2
} from './modules/bunker-management.js';

// Import automation
import { initAutomation, triggerAutoRebuyChecks } from './modules/automation.js';

// Import vessel management
import {
  updateVesselCount,
  updateRepairCount,
  departAllVessels,
  repairAllVessels,
  loadAcquirableVessels,
  showPendingVessels,
  displayVessels,
  showEngineFilterOverlay,
  closeEngineFilterOverlay,
  purchaseSingleVessel,
  purchaseBulk,
  setVesselFilter
} from './modules/vessel-management.js';

// =============================================================================
// Global State and DOM Element References
// =============================================================================

/**
 * Chat feed container element for displaying alliance messages.
 * @type {HTMLElement}
 */
const chatFeed = document.getElementById('chatFeed');

/**
 * Alliance chat message input textarea.
 * @type {HTMLTextAreaElement}
 */
const messageInput = document.getElementById('messageInput');

/**
 * Send button for alliance chat messages.
 * @type {HTMLButtonElement}
 */
const sendMessageBtn = document.getElementById('sendMessageBtn');

/**
 * Character counter display for alliance chat input (500 char limit).
 * @type {HTMLElement}
 */
const charCount = document.getElementById('charCount');

/**
 * Global settings object loaded from server.
 * Contains user preferences for alerts, thresholds, and AutoPilot features.
 * Loaded asynchronously during DOMContentLoaded and synchronized across tabs via WebSocket.
 *
 * @type {Object|null}
 * @property {number} fuelThreshold - Price threshold for fuel alerts ($/ton)
 * @property {number} co2Threshold - Price threshold for CO2 alerts ($/ton)
 * @property {number} maintenanceThreshold - Maintenance % threshold for repair alerts
 * @property {boolean} autoRebuyFuel - Enable automatic fuel purchasing
 * @property {boolean} autoRebuyFuelUseAlert - Use alert threshold for auto-rebuy
 * @property {number} autoRebuyFuelThreshold - Custom threshold for fuel auto-rebuy
 * @property {boolean} autoRebuyCO2 - Enable automatic CO2 purchasing
 * @property {boolean} autoRebuyCO2UseAlert - Use alert threshold for CO2 auto-rebuy
 * @property {number} autoRebuyCO2Threshold - Custom threshold for CO2 auto-rebuy
 * @property {boolean} autoDepartAll - Enable automatic vessel departures
 * @property {boolean} autoBulkRepair - Enable automatic bulk repairs
 * @property {boolean} autoCampaignRenewal - Enable automatic campaign renewal
 * @property {boolean} autoPilotNotifications - Enable AutoPilot action notifications
 */
let settings = null; // Will be loaded async on DOMContentLoaded

/**
 * Debouncing timeout handles for preventing excessive API calls.
 * These are used to batch rapid UI updates into single delayed API requests.
 *
 * @type {number|null}
 */
let updateBunkerTimeout = null;
let updateVesselTimeout = null;
let updateUnreadTimeout = null;
let updateRepairTimeout = null;

// =============================================================================
// Debounced Update Functions
// =============================================================================

/**
 * Debounced bunker status update to prevent excessive API calls.
 * Fetches current fuel/CO2 prices and storage levels, updates UI badges,
 * and triggers price alerts if thresholds are met.
 *
 * **Why debouncing?** When settings change rapidly (e.g., user adjusting threshold
 * slider), we want to wait until they're done before making expensive API calls.
 *
 * @function
 * @param {number} [delay=800] - Delay in milliseconds before executing update
 * @example
 * // Called when fuel threshold changes
 * debouncedUpdateBunkerStatus(800);
 */
function debouncedUpdateBunkerStatus(delay = 800) {
  clearTimeout(updateBunkerTimeout);
  updateBunkerTimeout = setTimeout(() => updateBunkerStatus(settings), delay);
}

/**
 * Debounced vessel count update to prevent excessive API calls.
 * Fetches vessels in harbor and updates the "Ready" badge count.
 *
 * @function
 * @param {number} [delay=800] - Delay in milliseconds before executing update
 * @example
 * // Called after vessel departure or purchase
 * debouncedUpdateVesselCount(500);
 */
function debouncedUpdateVesselCount(delay = 800) {
  clearTimeout(updateVesselTimeout);
  updateVesselTimeout = setTimeout(() => updateVesselCount(), delay);
}

/**
 * Debounced unread message badge update.
 * Fetches unread private message counts and updates the messenger badge.
 *
 * @function
 * @param {number} [delay=1000] - Delay in milliseconds before executing update
 * @example
 * // Called after sending/reading messages
 * debouncedUpdateUnreadBadge(1000);
 */
function debouncedUpdateUnreadBadge(delay = 1000) {
  clearTimeout(updateUnreadTimeout);
  updateUnreadTimeout = setTimeout(() => updateUnreadBadge(), delay);
}

/**
 * Debounced repair count update to prevent excessive API calls.
 * Fetches vessels needing maintenance based on threshold and updates "Repair" badge.
 *
 * @function
 * @param {number} [delay=800] - Delay in milliseconds before executing update
 * @example
 * // Called when maintenance threshold setting changes
 * debouncedUpdateRepairCount(500);
 */
function debouncedUpdateRepairCount(delay = 800) {
  clearTimeout(updateRepairTimeout);
  updateRepairTimeout = setTimeout(() => updateRepairCount(settings), delay);
}

// =============================================================================
// Global Function Exposure (Cross-Module Access Pattern)
// =============================================================================

/**
 * Expose debounced update functions globally for access by other modules.
 * Modules are ES6 modules with isolated scope, so cross-module communication
 * requires explicit window exposure.
 *
 * @global
 */
window.debouncedUpdateBunkerStatus = debouncedUpdateBunkerStatus;
window.debouncedUpdateVesselCount = debouncedUpdateVesselCount;
window.debouncedUpdateUnreadBadge = debouncedUpdateUnreadBadge;
window.debouncedUpdateRepairCount = debouncedUpdateRepairCount;
window.updateVesselCount = updateVesselCount;

/**
 * Expose settings getter for automation module.
 * Allows automation to access current settings without tight coupling.
 *
 * @function
 * @global
 * @returns {Object} Current settings object
 */
window.getSettings = () => settings;

/**
 * Expose automation trigger for bunker-management module.
 * Called after manual fuel/CO2 purchases to check if AutoPilot should activate.
 *
 * @function
 * @global
 */
window.triggerAutoRebuyChecks = triggerAutoRebuyChecks;

// =============================================================================
// WebSocket Settings Synchronization Handler
// =============================================================================

/**
 * Handles settings updates received from other browser tabs/devices via WebSocket.
 *
 * **Critical Multi-Client Sync Function:**
 * When a user changes settings in one browser tab/window, the server broadcasts
 * the updated settings to ALL connected clients via WebSocket. This function
 * receives those broadcasts and synchronizes the local UI to match.
 *
 * **What it updates:**
 * - All checkbox states (AutoPilot features)
 * - All threshold input values (fuel, CO2, maintenance)
 * - Visibility of conditional UI elements (auto-rebuy options)
 * - Disabled state of threshold inputs (when "use alert" is checked)
 * - Page title (shows "AutoPilot" indicator when features enabled)
 * - Repair count badge (if maintenance threshold changed)
 *
 * **Important Pattern:**
 * When "Use Alert" checkbox is enabled for auto-rebuy features, the custom
 * threshold input becomes disabled and shows the alert threshold value instead.
 * This prevents conflicting configurations.
 *
 * @function
 * @global
 * @param {Object} newSettings - Updated settings object from server
 * @param {number} newSettings.fuelThreshold - Alert threshold for fuel
 * @param {number} newSettings.co2Threshold - Alert threshold for CO2
 * @param {number} newSettings.maintenanceThreshold - Maintenance % threshold
 * @param {boolean} newSettings.autoRebuyFuel - Auto-rebuy fuel enabled
 * @param {boolean} newSettings.autoRebuyFuelUseAlert - Use alert threshold for fuel rebuy
 * @param {number} newSettings.autoRebuyFuelThreshold - Custom fuel rebuy threshold
 * @param {boolean} newSettings.autoRebuyCO2 - Auto-rebuy CO2 enabled
 * @param {boolean} newSettings.autoRebuyCO2UseAlert - Use alert threshold for CO2 rebuy
 * @param {number} newSettings.autoRebuyCO2Threshold - Custom CO2 rebuy threshold
 * @param {boolean} newSettings.autoDepartAll - Auto-depart vessels enabled
 * @param {boolean} newSettings.autoBulkRepair - Auto-repair vessels enabled
 * @param {boolean} newSettings.autoCampaignRenewal - Auto-renew campaigns enabled
 * @param {boolean} newSettings.autoPilotNotifications - Show AutoPilot notifications
 *
 * @example
 * // Called by WebSocket message handler in chat.js
 * // when server broadcasts: { type: 'settings_update', data: {...} }
 * window.handleSettingsUpdate(data);
 */
window.handleSettingsUpdate = (newSettings) => {
  // Update local settings object
  settings = newSettings;

  // Update all checkboxes and input fields
  const fuelThresholdInput = document.getElementById('fuelThreshold');
  const co2ThresholdInput = document.getElementById('co2Threshold');
  const maintenanceThresholdInput = document.getElementById('maintenanceThreshold');
  const autoRebuyFuelCheckbox = document.getElementById('autoRebuyFuel');
  const autoRebuyFuelUseAlertCheckbox = document.getElementById('autoRebuyFuelUseAlert');
  const autoRebuyFuelThresholdInput = document.getElementById('autoRebuyFuelThreshold');
  const autoRebuyCO2Checkbox = document.getElementById('autoRebuyCO2');
  const autoRebuyCO2UseAlertCheckbox = document.getElementById('autoRebuyCO2UseAlert');
  const autoRebuyCO2ThresholdInput = document.getElementById('autoRebuyCO2Threshold');
  const autoDepartAllCheckbox = document.getElementById('autoDepartAll');
  const autoBulkRepairCheckbox = document.getElementById('autoBulkRepair');
  const autoCampaignRenewalCheckbox = document.getElementById('autoCampaignRenewal');
  const autoPilotNotificationsCheckbox = document.getElementById('autoPilotNotifications');

  if (fuelThresholdInput) fuelThresholdInput.value = newSettings.fuelThreshold;
  if (co2ThresholdInput) co2ThresholdInput.value = newSettings.co2Threshold;
  if (maintenanceThresholdInput) maintenanceThresholdInput.value = newSettings.maintenanceThreshold;

  if (autoRebuyFuelCheckbox) {
    autoRebuyFuelCheckbox.checked = newSettings.autoRebuyFuel;
    const fuelOptions = document.getElementById('autoRebuyFuelOptions');
    if (fuelOptions) {
      fuelOptions.style.display = newSettings.autoRebuyFuel ? 'block' : 'none';
    }
  }
  if (autoRebuyFuelUseAlertCheckbox) {
    const fuelUseAlert = newSettings.autoRebuyFuelUseAlert;
    autoRebuyFuelUseAlertCheckbox.checked = fuelUseAlert;

    if (autoRebuyFuelThresholdInput) {
      if (fuelUseAlert) {
        autoRebuyFuelThresholdInput.value = newSettings.fuelThreshold;
        autoRebuyFuelThresholdInput.disabled = true;
        autoRebuyFuelThresholdInput.style.opacity = '0.5';
        autoRebuyFuelThresholdInput.style.cursor = 'not-allowed';
      } else {
        autoRebuyFuelThresholdInput.value = newSettings.autoRebuyFuelThreshold;
        autoRebuyFuelThresholdInput.disabled = false;
        autoRebuyFuelThresholdInput.style.opacity = '1';
        autoRebuyFuelThresholdInput.style.cursor = 'text';
      }
    }
  }

  if (autoRebuyCO2Checkbox) {
    autoRebuyCO2Checkbox.checked = newSettings.autoRebuyCO2;
    const co2Options = document.getElementById('autoRebuyCO2Options');
    if (co2Options) {
      co2Options.style.display = newSettings.autoRebuyCO2 ? 'block' : 'none';
    }
  }
  if (autoRebuyCO2UseAlertCheckbox) {
    const co2UseAlert = newSettings.autoRebuyCO2UseAlert;
    autoRebuyCO2UseAlertCheckbox.checked = co2UseAlert;

    if (autoRebuyCO2ThresholdInput) {
      if (co2UseAlert) {
        autoRebuyCO2ThresholdInput.value = newSettings.co2Threshold;
        autoRebuyCO2ThresholdInput.disabled = true;
        autoRebuyCO2ThresholdInput.style.opacity = '0.5';
        autoRebuyCO2ThresholdInput.style.cursor = 'not-allowed';
      } else {
        autoRebuyCO2ThresholdInput.value = newSettings.autoRebuyCO2Threshold;
        autoRebuyCO2ThresholdInput.disabled = false;
        autoRebuyCO2ThresholdInput.style.opacity = '1';
        autoRebuyCO2ThresholdInput.style.cursor = 'text';
      }
    }
  }

  if (autoDepartAllCheckbox) autoDepartAllCheckbox.checked = newSettings.autoDepartAll;
  if (autoBulkRepairCheckbox) autoBulkRepairCheckbox.checked = newSettings.autoBulkRepair;
  if (autoCampaignRenewalCheckbox) autoCampaignRenewalCheckbox.checked = newSettings.autoCampaignRenewal;
  if (autoPilotNotificationsCheckbox) autoPilotNotificationsCheckbox.checked = newSettings.autoPilotNotifications;

  // Update page title (AutoPilot mode)
  updatePageTitle(settings);

  // Update repair count if maintenance threshold changed
  debouncedUpdateRepairCount(500);
};

// =============================================================================
// Test Notification Function
// =============================================================================

/**
 * Tests browser notification system with a sample price alert.
 * Triggered by "Test Alert" button in settings dialog.
 *
 * **What it does:**
 * 1. Checks notification permission status
 * 2. Sends a browser notification with current threshold values
 * 3. Shows an in-page alert overlay with the same information
 * 4. If notification fails, displays detailed error information
 *
 * **Use case:** Allows users to verify notifications work before relying on
 * AutoPilot price alerts. Shows permission status, secure context, and protocol
 * information for troubleshooting.
 *
 * @async
 * @function
 * @returns {Promise<void>}
 *
 * @example
 * // Called from settings dialog test button
 * await testBrowserNotification();
 */
async function testBrowserNotification() {
  const hasPermission = await requestNotificationPermission();

  if (!hasPermission) {
    showFeedback('Please enable notifications first!', 'error');
    return;
  }

  try {
    await showNotification('🔔 Test Price Alert', {
      body: `Test Alert!\n\nFuel threshold: $${settings.fuelThreshold}/ton\nCO2 threshold: $${settings.co2Threshold}/ton`,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⚓</text></svg>",
      tag: 'test-alert',
      silent: false
    });

    showPriceAlert(`⚠️ Test Alert<br><br>⛽ Fuel threshold: <strong>$${settings.fuelThreshold}/ton</strong><br>💨 CO2 threshold: <strong>$${settings.co2Threshold}/ton</strong>`, 'warning');
  } catch (error) {
    console.error('[Test Alert] Notification error:', error);
    showPriceAlert(`❌ Failed to send notification<br><br><strong>Error:</strong> ${error.message}<br><br><strong>Permission:</strong> ${Notification.permission}<br><strong>Secure:</strong> ${window.isSecureContext ? 'Yes' : 'No'}<br><strong>Protocol:</strong> ${window.location.protocol}`, 'error');
  }
}

// =============================================================================
// Window-Exposed Functions for HTML onclick Handlers
// =============================================================================

/**
 * Wrapper for campaign purchase that exposes the function to HTML onclick handlers.
 * HTML elements cannot directly call module-scoped functions, so this exposes
 * the functionality globally via window object.
 *
 * **Why needed:**
 * Campaign buttons in the overlay are dynamically generated with inline onclick
 * handlers that need access to this function. Alternative would be event delegation,
 * but inline handlers are simpler for dynamic content.
 *
 * @function
 * @global
 * @param {number} campaignId - Unique identifier for the campaign
 * @param {string} typeName - Campaign type name (e.g., "Premium Transport", "Luxury Cargo")
 * @param {number} duration - Campaign duration in days
 * @param {number} price - Campaign cost in game currency
 *
 * @example
 * // Called from dynamically generated HTML button
 * <button onclick="window.buyCampaign(123, 'Premium Transport', 30, 50000)">
 *   Buy Campaign
 * </button>
 */
window.buyCampaign = (campaignId, typeName, duration, price) => {
  buyCampaign(campaignId, typeName, duration, price, {
    updateCampaignsStatus: () => updateCampaignsStatus(),
    updateBunkerStatus: () => debouncedUpdateBunkerStatus(500)
  });
};

/**
 * Global wrapper for sendCoopMax function.
 * Allows HTML onclick handlers to call the coop send function.
 *
 * @global
 * @param {number} userId - Target user ID to send coop vessels to
 */
window.sendCoopMax = (userId) => {
  sendCoopMax(userId);
};

/**
 * Exposes messenger opening function for chat message user interactions.
 * Allows clicking on usernames in chat to open private message conversation.
 *
 * @function
 * @global
 */
window.openMessengerFromChat = openMessenger;

/**
 * Exposes new chat opening function for contact list interactions.
 * Allows clicking on contacts to start new private conversations.
 *
 * @function
 * @global
 */
window.openNewChatFromContact = openNewChat;

// =============================================================================
// DOMContentLoaded - Main Application Initialization
// =============================================================================

/**
 * Main application initialization handler.
 * Executes when DOM is fully loaded and ready for manipulation.
 *
 * **Initialization Sequence (Order is Critical):**
 *
 * 1. **Load Settings** - MUST happen first as other modules depend on settings state
 * 2. **Register Service Worker** - Enables background notifications on mobile devices
 * 3. **Initialize Tooltips** - Sets up custom tooltip behavior for all [data-tooltip] elements
 * 4. **Attach Event Listeners** - Binds 60+ UI interactions (buttons, inputs, checkboxes)
 * 5. **Load Initial Data** - Fetches alliance members, messages, vessels, bunker status
 *    - Uses 500ms delays between calls to prevent API socket hang-ups (server limitation)
 * 6. **Initialize WebSocket** - Establishes real-time chat and settings sync connection
 * 7. **Initialize Automation** - Starts AutoPilot monitoring system
 * 8. **Update Page Title** - Sets title based on AutoPilot status
 * 9. **Start Auto-Refresh Intervals** - Sets up periodic data updates with randomization
 *
 * **Event Listener Categories:**
 * - Alliance chat (send message, input handling, Enter key)
 * - Private messenger (open, close, send, delete chat)
 * - Chat selection overlay (navigation between chats)
 * - Contact list (open, close, select contact)
 * - Settings dialog (open, close, test alerts)
 * - Vessel catalog (open, close, filter, purchase)
 * - Settings thresholds (fuel, CO2, maintenance)
 * - AutoPilot checkboxes (auto-rebuy, auto-depart, auto-repair, auto-renew)
 * - Auto-rebuy options (use alert threshold vs custom threshold)
 * - Vessel management (depart all, repair all, anchor info)
 * - Bunker management (buy fuel, buy CO2)
 * - Notification permission (request, auto-request on load)
 *
 * **Auto-Refresh Intervals (Anti-Detection Pattern):**
 * Uses randomized intervals to avoid perfectly timed API calls that could
 * trigger server-side bot detection:
 * - Chat messages: 25-27 seconds (25000 + random 2000ms)
 * - Unread badges: 30-35 seconds (30000 + random 5000ms)
 * - Vessel counts: 60-70 seconds (60000 + random 10000ms)
 * - Repair counts: 60-70 seconds (60000 + random 10000ms)
 * - Bunker status: 30-35 seconds (30000 + random 5000ms)
 * - Campaign status: 60-70 seconds (60000 + random 10000ms)
 *
 * **Settings Synchronization Pattern:**
 * When settings change:
 * 1. Update local `settings` object
 * 2. Call `saveSettings()` to persist to server via POST /api/settings/save
 * 3. Server broadcasts update to ALL connected WebSocket clients
 * 4. Other clients receive update and call `handleSettingsUpdate()`
 * 5. All tabs/devices stay in sync automatically
 *
 * **Auto-Rebuy Threshold Logic:**
 * - "Use Alert Threshold" checkbox enables/disables custom threshold input
 * - When checked: input shows alert threshold value and becomes disabled
 * - When unchecked: input becomes editable for custom threshold
 * - This prevents conflicting configurations (e.g., alert at $400 but rebuy at $500)
 *
 * @event DOMContentLoaded
 * @async
 * @listens DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  // ===== STEP 1: Load Settings =====
  // CRITICAL: Must happen first as other modules depend on settings state
  settings = await loadSettings();

  // ===== STEP 1.5: Load User Settings (CEO Level & Points) =====
  try {
    const userResponse = await fetch('/api/user/get-settings');
    if (userResponse.ok) {
      const userData = await userResponse.json();

      // CEO Level
      const ceoLevel = userData.user?.ceo_level || userData.data?.settings?.ceo_level || 0;
      if (ceoLevel > 0) {
        const ceoLevelBadge = document.getElementById('ceoLevelBadge');
        const ceoLevelNumber = document.getElementById('ceoLevelNumber');
        if (ceoLevelBadge && ceoLevelNumber) {
          ceoLevelNumber.textContent = ceoLevel;
          ceoLevelBadge.style.display = 'inline-block';
        }
      }

      // Points (Premium Currency)
      const points = userData.user?.points || 0;
      const pointsDisplay = document.getElementById('pointsDisplay');
      if (pointsDisplay) {
        pointsDisplay.textContent = points.toLocaleString();
      }
    }
  } catch (error) {
    console.error('[User Settings] Failed to load:', error);
  }

  // ===== STEP 2: Register Service Worker =====
  // Enables background notifications on mobile devices
  await registerServiceWorker();

  // ===== STEP 3: Initialize Custom Tooltips =====
  initCustomTooltips();

  // ===== STEP 4: Attach Event Listeners =====

  // --- Alliance Chat Event Listeners ---
  // Send message button click
  sendMessageBtn.addEventListener('click', () => sendMessage(messageInput, charCount, sendMessageBtn, chatFeed));

  // Chat input character counter
  messageInput.addEventListener('input', () => handleMessageInput(messageInput, charCount));

  // Enter key to send message (Shift+Enter for new line)
  // Prevents sending when member suggestion dropdown is open (@ mentions)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey &&
        (!document.getElementById('memberSuggestions') || document.getElementById('memberSuggestions').style.display !== 'block')) {
      e.preventDefault();
      sendMessage(messageInput, charCount, sendMessageBtn, chatFeed);
    }
  });

  // Chat scroll detection for "load more" functionality
  setChatScrollListener(chatFeed);

  // --- Private Messenger Event Listeners ---
  // Close messenger overlay
  document.getElementById('closeMessengerBtn').addEventListener('click', closeMessenger);

  // Delete current private chat conversation
  document.getElementById('deleteChatBtn').addEventListener('click', deleteCurrentChat);

  // Back button: closes current chat view and reopens recipient selection
  document.getElementById('backToSelectionBtn').addEventListener('click', () => {
    const currentChat = getCurrentPrivateChat();
    const targetCompanyName = currentChat.targetCompanyName;
    const targetUserId = currentChat.targetUserId;
    closeMessenger();
    openMessenger(targetCompanyName, targetUserId);
  });

  // Send private message button
  document.getElementById('sendPrivateMessageBtn').addEventListener('click', sendPrivateMessage);

  // Enter key to send private message (Shift+Enter for new line)
  document.getElementById('messengerInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrivateMessage();
    }
  });

  // --- Chat Selection Overlay Event Listeners ---
  // Back button in chat selection (returns to all chats overview)
  document.getElementById('backToAllChatsBtn').addEventListener('click', () => {
    closeChatSelection();
    showAllChats();
  });

  // Close chat selection overlay
  document.getElementById('closeChatSelectionBtn').addEventListener('click', closeChatSelection);

  // --- All Chats Overview Event Listeners ---
  // Open all chats list
  document.getElementById('allChatsBtn').addEventListener('click', showAllChats);

  // Close all chats list
  document.getElementById('closeAllChatsBtn').addEventListener('click', closeAllChats);

  // --- Contact List Event Listeners ---
  // Open contact list overlay
  document.getElementById('contactListBtn').addEventListener('click', showContactList);

  // Close contact list overlay
  document.getElementById('closeContactListBtn').addEventListener('click', closeContactList);

  // --- Settings and Dialogs Event Listeners ---
  // Open settings dialog
  document.getElementById('settingsBtn').addEventListener('click', () => showSettings(settings));

  // Close settings dialog
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);

  // Open documentation in new tab
  document.getElementById('docsBtn').addEventListener('click', () => {
    window.open('/docs/index.html', '_blank');
  });

  // Open campaigns overlay
  document.getElementById('campaignsBtn').addEventListener('click', showCampaignsOverlay);

  // Close campaigns overlay
  document.getElementById('closeCampaignsBtn').addEventListener('click', closeCampaignsOverlay);

  // Open coop overlay
  document.getElementById('coopBtn').addEventListener('click', showCoopOverlay);

  // Close coop overlay
  document.getElementById('closeCoopBtn').addEventListener('click', closeCoopOverlay);

  // Test notification button in settings
  document.getElementById('testAlertBtn').addEventListener('click', testBrowserNotification);

  // --- Vessel Catalog Event Listeners ---
  // Open vessel catalog overlay and load available vessels for purchase
  document.getElementById('buyVesselsBtn').addEventListener('click', async () => {
    document.getElementById('buyVesselsOverlay').style.display = 'flex';
    await loadAcquirableVessels();
  });

  // Filter to show only pending vessel purchases (not yet delivered)
  document.getElementById('filterPendingBtn').addEventListener('click', async () => {
    const { fetchVessels } = await import('./modules/api.js');
    const response = await fetchVessels();
    const pendingVessels = (response.vessels || []).filter(v => v.status === 'pending');
    showPendingVessels(pendingVessels);
  });

  // Close vessel catalog overlay
  document.getElementById('closeBuyVesselsBtn').addEventListener('click', () => {
    document.getElementById('buyVesselsOverlay').style.display = 'none';
  });

  // Filter vessel catalog to show only container ships
  document.getElementById('filterContainerBtn').addEventListener('click', () => {
    setVesselFilter('container');
    document.getElementById('filterContainerBtn').classList.add('active');
    document.getElementById('filterTankerBtn').classList.remove('active');
    document.getElementById('filterEngineBtn').classList.remove('active');
    document.getElementById('filterPendingBtn').classList.remove('active');
    displayVessels();
  });

  // Filter vessel catalog to show only tanker ships
  document.getElementById('filterTankerBtn').addEventListener('click', () => {
    setVesselFilter('tanker');
    document.getElementById('filterTankerBtn').classList.add('active');
    document.getElementById('filterContainerBtn').classList.remove('active');
    document.getElementById('filterEngineBtn').classList.remove('active');
    document.getElementById('filterPendingBtn').classList.remove('active');
    displayVessels();
  });

  // Open engine type filter overlay (filter by engine: diesel, gas turbine, etc.)
  document.getElementById('filterEngineBtn').addEventListener('click', () => {
    showEngineFilterOverlay();
  });

  // Close engine filter overlay
  document.getElementById('closeEngineFilterBtn').addEventListener('click', closeEngineFilterOverlay);

  // Bulk purchase button (buy multiple vessels at once)
  document.getElementById('bulkBuyBtn').addEventListener('click', purchaseBulk);

  // --- Settings Threshold Event Listeners ---
  // Fuel price alert threshold ($/ton)
  document.getElementById('fuelThreshold').addEventListener('change', function() {
    settings.fuelThreshold = parseInt(this.value);
    saveSettings(settings);
  });

  // CO2 price alert threshold ($/ton)
  document.getElementById('co2Threshold').addEventListener('change', function() {
    settings.co2Threshold = parseInt(this.value);
    saveSettings(settings);
  });

  // Maintenance alert threshold (percentage)
  // Updates repair count badge when changed
  document.getElementById('maintenanceThreshold').addEventListener('change', function() {
    settings.maintenanceThreshold = parseInt(this.value);
    saveSettings(settings);
    debouncedUpdateRepairCount(500);
  });

  // --- AutoPilot Auto-Rebuy Fuel Event Listeners ---
  // Enable/disable auto-rebuy fuel
  // Shows/hides additional options when toggled
  document.getElementById('autoRebuyFuel').addEventListener('change', function() {
    settings.autoRebuyFuel = this.checked;
    // Show/hide threshold options based on checkbox state
    document.getElementById('autoRebuyFuelOptions').style.display = this.checked ? 'block' : 'none';
    saveSettings(settings);
    updatePageTitle(settings);
  });

  // Toggle between using alert threshold vs custom threshold for auto-rebuy
  // When checked: uses fuelThreshold and disables custom input
  // When unchecked: enables custom threshold input
  document.getElementById('autoRebuyFuelUseAlert').addEventListener('change', function() {
    settings.autoRebuyFuelUseAlert = this.checked;
    const thresholdInput = document.getElementById('autoRebuyFuelThreshold');

    if (this.checked) {
      // Use alert value: set to fuelThreshold and disable input
      thresholdInput.value = settings.fuelThreshold;
      thresholdInput.disabled = true;
      thresholdInput.style.opacity = '0.5';
      thresholdInput.style.cursor = 'not-allowed';
    } else {
      // Use custom value: enable input
      thresholdInput.disabled = false;
      thresholdInput.style.opacity = '1';
      thresholdInput.style.cursor = 'text';
    }

    saveSettings(settings);
  });

  // Custom threshold for auto-rebuy fuel (only used when "use alert" unchecked)
  document.getElementById('autoRebuyFuelThreshold').addEventListener('change', function() {
    settings.autoRebuyFuelThreshold = parseInt(this.value);
    saveSettings(settings);
  });

  // --- AutoPilot Auto-Rebuy CO2 Event Listeners ---
  // Enable/disable auto-rebuy CO2
  // Shows/hides additional options when toggled
  document.getElementById('autoRebuyCO2').addEventListener('change', function() {
    settings.autoRebuyCO2 = this.checked;
    // Show/hide threshold options based on checkbox state
    document.getElementById('autoRebuyCO2Options').style.display = this.checked ? 'block' : 'none';
    saveSettings(settings);
    updatePageTitle(settings);
  });

  // Toggle between using alert threshold vs custom threshold for CO2 auto-rebuy
  // When checked: uses co2Threshold and disables custom input
  // When unchecked: enables custom threshold input
  document.getElementById('autoRebuyCO2UseAlert').addEventListener('change', function() {
    settings.autoRebuyCO2UseAlert = this.checked;
    const thresholdInput = document.getElementById('autoRebuyCO2Threshold');

    if (this.checked) {
      // Use alert value: set to co2Threshold and disable input
      thresholdInput.value = settings.co2Threshold;
      thresholdInput.disabled = true;
      thresholdInput.style.opacity = '0.5';
      thresholdInput.style.cursor = 'not-allowed';
    } else {
      // Use custom value: enable input
      thresholdInput.disabled = false;
      thresholdInput.style.opacity = '1';
      thresholdInput.style.cursor = 'text';
    }

    saveSettings(settings);
  });

  // Custom threshold for auto-rebuy CO2 (only used when "use alert" unchecked)
  document.getElementById('autoRebuyCO2Threshold').addEventListener('change', function() {
    settings.autoRebuyCO2Threshold = parseInt(this.value);
    saveSettings(settings);
  });

  // --- AutoPilot Feature Toggles ---
  // Auto-depart all ready vessels
  document.getElementById('autoDepartAll').addEventListener('change', function() {
    settings.autoDepartAll = this.checked;
    saveSettings(settings);
    updatePageTitle(settings);
  });

  // Auto-repair all vessels below maintenance threshold
  document.getElementById('autoBulkRepair').addEventListener('change', function() {
    settings.autoBulkRepair = this.checked;
    saveSettings(settings);
    updatePageTitle(settings);
  });

  // Auto-repair interval
  document.getElementById('autoRepairInterval').addEventListener('change', function() {
    settings.autoRepairInterval = this.value;
    saveSettings(settings);
  });

  // Auto-renew expiring campaigns
  document.getElementById('autoCampaignRenewal').addEventListener('change', function() {
    settings.autoCampaignRenewal = this.checked;
    saveSettings(settings);
    updatePageTitle(settings);
  });

  // Enable/disable AutoPilot action notifications
  document.getElementById('autoPilotNotifications').addEventListener('change', function() {
    settings.autoPilotNotifications = this.checked;
    saveSettings(settings);
  });

  // --- Intelligent Auto-Depart Settings ---
  // Toggle between using route defaults vs custom settings
  document.getElementById('autoDepartUseRouteDefaults').addEventListener('change', function() {
    settings.autoDepartUseRouteDefaults = this.checked;
    const customSettingsDiv = document.getElementById('autoDepartCustomSettings');

    if (this.checked) {
      // Use route defaults: hide custom settings
      customSettingsDiv.style.display = 'none';
    } else {
      // Use custom settings: show inputs
      customSettingsDiv.style.display = 'block';
    }

    saveSettings(settings);
  });

  // Minimum vessel utilization percentage for auto-depart (only used when not using route defaults)
  document.getElementById('minVesselUtilization').addEventListener('change', function() {
    settings.minVesselUtilization = parseInt(this.value);
    saveSettings(settings);
  });

  // Vessel speed as percentage of max_speed (only used when not using route defaults)
  document.getElementById('autoVesselSpeed').addEventListener('change', function() {
    settings.autoVesselSpeed = parseInt(this.value);
    saveSettings(settings);
  });

  // --- Vessel Management Event Listeners ---
  // Depart all ready vessels in harbor
  document.getElementById('departAllBtn').addEventListener('click', departAllVessels);

  // Show anchor info overlay (vessel status details)
  document.getElementById('anchorBtn').addEventListener('click', showAnchorInfo);

  // Repair all vessels below maintenance threshold
  document.getElementById('repairAllBtn').addEventListener('click', () => repairAllVessels(settings));

  // --- Bunker Management Event Listeners ---
  // Buy maximum fuel based on available storage
  document.getElementById('fuelBtn').addEventListener('click', buyMaxFuel);

  // Buy maximum CO2 certificates based on available storage
  document.getElementById('co2Btn').addEventListener('click', buyMaxCO2);

  // --- Messenger Input Auto-Resize ---
  // Automatically adjusts textarea height as user types (max 120px)
  document.getElementById('messengerInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // --- Notification Permission Management ---
  // Button to manually request notification permission
  const notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', async () => {
      const hasPermission = await requestNotificationPermission();
      if (hasPermission) {
        notificationBtn.style.display = 'none';
        showFeedback('Notifications enabled!', 'success');
      }
    });
    // Hide button if permission already granted
    if (Notification.permission === "granted") {
      notificationBtn.style.display = 'none';
    }
  }

  // Auto-request notification permission on load (if not already decided)
  if ("Notification" in window && Notification.permission === "default") {
    await requestNotificationPermission();
  }

  // ===== STEP 5: Load Initial Data =====
  // Loads all initial data with 500ms delays between API calls to prevent
  // socket hang-ups (server limitation when handling rapid concurrent requests).
  // Each call is awaited sequentially to maintain proper pacing.

  // Load alliance member list (for @ mentions autocomplete)
  await loadAllianceMembers();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Load alliance chat messages
  await loadMessages(chatFeed);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Load unread private message count (updates messenger badge)
  await updateUnreadBadge();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Load vessel count in harbor (updates "Ready" badge)
  await updateVesselCount();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Load vessels needing repair (updates "Repair" badge)
  await updateRepairCount(settings);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Load fuel/CO2 prices and storage levels (updates "Bunker" badge)
  await updateBunkerStatus(settings);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Load campaign status (updates "Campaigns" badge)
  await updateCampaignsStatus();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Load coop status (updates "Coop" badge)
  await updateCoopBadge();
  await new Promise(resolve => setTimeout(resolve, 500));

  // ===== STEP 6: Initialize WebSocket =====
  // Establishes wss:// connection for real-time chat updates and settings sync
  initWebSocket();

  // ===== STEP 7: Initialize Automation System =====
  // Starts AutoPilot monitoring intervals for auto-rebuy, auto-depart, etc.
  initAutomation();

  // ===== STEP 8: Update Page Title =====
  // Shows "AutoPilot" indicator in title if any automation features enabled
  updatePageTitle(settings);

  // ===== STEP 9: Start Auto-Refresh Intervals =====
  // Randomized intervals prevent server-side bot detection based on perfectly
  // timed API requests. Each interval adds random milliseconds to base interval.

  // Refresh alliance chat messages every 25-27 seconds
  setInterval(() => loadMessages(chatFeed), 25000 + Math.random() * 2000);

  // Refresh unread message badge every 30-35 seconds
  setInterval(updateUnreadBadge, 30000 + Math.random() * 5000);

  // Refresh vessel count every 60-70 seconds
  setInterval(updateVesselCount, 60000 + Math.random() * 10000);

  // Refresh repair count every 60-70 seconds
  setInterval(() => updateRepairCount(settings), 60000 + Math.random() * 10000);

  // Refresh bunker status every 30-35 seconds
  setInterval(() => updateBunkerStatus(settings), 30000 + Math.random() * 5000);

  // Refresh campaign status every 60-70 seconds
  setInterval(updateCampaignsStatus, 60000 + Math.random() * 10000);
});
