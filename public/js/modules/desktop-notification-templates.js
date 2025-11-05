/**
 * Desktop Notification Templates
 *
 * Standardized desktop/browser notification system with consistent formatting.
 *
 * @module desktop-notification-templates
 * @see docs/DESKTOP_NOTIFICATION_FORMATS.md for detailed format specification
 */

import { showNotification } from './utils.js';

/**
 * Notification type definitions with default emojis
 * @const {Object<string, string>}
 */
const NOTIFICATION_TYPES = {
  ok: '✅',       // Success/Completion
  warning: '⚠️',  // Warnings
  error: '❌',    // Errors
  alert: '📢'     // Important Alerts
};

/**
 * Valid notification type names
 * @const {string[]}
 */
const VALID_TYPES = Object.keys(NOTIFICATION_TYPES);

/**
 * Create a standardized desktop notification with consistent formatting.
 *
 * Format: EMOJI TITEL\n\nCONTENT
 *
 * @param {string} type - Notification type: 'ok' | 'warning' | 'error' | 'alert'
 * @param {string} title - Notification title (without emoji)
 * @param {string} content - Notification content/body (can be multi-line)
 * @param {string|null} [emoji=null] - Optional custom emoji. If not provided, uses type-specific default
 * @param {Object} [options={}] - Additional options to pass to showNotification()
 * @param {string} [options.tag] - Notification tag for grouping (auto-generated if not provided)
 * @param {string} [options.icon] - Custom icon (defaults to emoji SVG)
 * @param {boolean} [options.silent] - Silent notification (default: false)
 * @param {number[]} [options.vibrate] - Vibration pattern (default: [200, 100, 200])
 * @param {boolean} [options.requireInteraction] - Notification stays visible (default: false)
 * @param {boolean} [options.autoClose] - Auto-close after 5 seconds (default: true)
 * @param {Object} [options.data] - Custom data object
 *
 * @returns {Promise<Notification|null>} Notification instance or null if not permitted
 *
 * @throws {Error} If type is invalid
 * @throws {Error} If title or content is empty
 *
 * @example
 * // Success with custom emoji
 * await createDesktopNotification('ok', 'Barrel Boss', '10,000t @ $350/t\nTotal: $3,500,000', '⛽');
 * // Result: "⛽ Barrel Boss\n\n10,000t @ $350/t\nTotal: $3,500,000"
 *
 * @example
 * // Warning with default emoji (⚠️)
 * await createDesktopNotification('warning', 'Cargo Marshal', '2 vessels not departed\n\nAtlantic Star: Insufficient fuel');
 * // Result: "⚠️ Cargo Marshal\n\n2 vessels not departed\n\nAtlantic Star: Insufficient fuel"
 *
 * @example
 * // Alert with custom emoji
 * await createDesktopNotification('alert', 'Fuel Price Alert', 'Price: $350/t\nThreshold: $400/t', '⛽');
 * // Result: "⛽ Fuel Price Alert\n\nPrice: $350/t\nThreshold: $400/t"
 *
 * @example
 * // Error with default emoji (❌)
 * await createDesktopNotification('error', 'Purchase Failed', 'Insufficient funds\nRequired: $1,000,000', null, { requireInteraction: true });
 * // Result: "❌ Purchase Failed\n\nInsufficient funds\nRequired: $1,000,000"
 */
export async function createDesktopNotification(type, title, content, emoji = null, options = {}) {
  // Validate type
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid notification type: "${type}". Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  // Validate title
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('Notification title is required and must be a non-empty string');
  }

  // Validate content
  if (content === undefined || content === null || typeof content !== 'string') {
    throw new Error('Notification content is required and must be a string');
  }

  // Get emoji (custom or type-specific default)
  const finalEmoji = emoji || NOTIFICATION_TYPES[type];

  // Build standardized title: EMOJI TITEL
  const fullTitle = `${finalEmoji} ${title.trim()}`;

  // Build standardized body: \n\nCONTENT
  const fullBody = `\n\n${content}`;

  // Auto-generate tag if not provided
  const tag = options.tag || `${type}-${title.toLowerCase().replace(/\s+/g, '-')}`;

  // Merge options with defaults
  const finalOptions = {
    body: fullBody,
    tag: tag,
    silent: false,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    autoClose: true,
    ...options // User options override defaults
  };

  // Call showNotification from utils.js
  return await showNotification(fullTitle, finalOptions);
}

/**
 * Check if a notification type is valid
 *
 * @param {string} type - Type to validate
 * @returns {boolean} True if type is valid
 *
 * @example
 * isValidNotificationType('ok') // true
 * isValidNotificationType('invalid') // false
 */
export function isValidNotificationType(type) {
  return VALID_TYPES.includes(type);
}

/**
 * Get the default emoji for a notification type
 *
 * @param {string} type - Notification type
 * @returns {string|null} Default emoji or null if type is invalid
 *
 * @example
 * getDefaultEmoji('ok') // '✅'
 * getDefaultEmoji('alert') // '📢'
 * getDefaultEmoji('invalid') // null
 */
export function getDefaultEmoji(type) {
  return NOTIFICATION_TYPES[type] || null;
}

/**
 * Get all supported notification types
 *
 * @returns {string[]} Array of valid notification types
 *
 * @example
 * getNotificationTypes() // ['ok', 'warning', 'error', 'alert']
 */
export function getNotificationTypes() {
  return [...VALID_TYPES];
}

/**
 * Convenience function: Create success notification
 *
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 * @param {string|null} [emoji=null] - Optional custom emoji
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<Notification|null>}
 *
 * @example
 * await notifySuccess('Purchase Complete', 'Fuel tank filled\nTotal: $3,500,000', '⛽');
 */
export async function notifySuccess(title, content, emoji = null, options = {}) {
  return await createDesktopNotification('ok', title, content, emoji, options);
}

/**
 * Convenience function: Create warning notification
 *
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 * @param {string|null} [emoji=null] - Optional custom emoji
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<Notification|null>}
 *
 * @example
 * await notifyWarning('Low Fuel', 'Fuel level below 10%\nRefill recommended');
 */
export async function notifyWarning(title, content, emoji = null, options = {}) {
  return await createDesktopNotification('warning', title, content, emoji, options);
}

/**
 * Convenience function: Create error notification
 *
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 * @param {string|null} [emoji=null] - Optional custom emoji
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<Notification|null>}
 *
 * @example
 * await notifyError('Purchase Failed', 'Insufficient funds\nRequired: $1,000,000');
 */
export async function notifyError(title, content, emoji = null, options = {}) {
  return await createDesktopNotification('error', title, content, emoji, options);
}

/**
 * Convenience function: Create alert notification
 *
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 * @param {string|null} [emoji=null] - Optional custom emoji
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<Notification|null>}
 *
 * @example
 * await notifyAlert('Price Alert', 'Fuel @ $350/t\nBelow threshold!', '⛽');
 */
export async function notifyAlert(title, content, emoji = null, options = {}) {
  return await createDesktopNotification('alert', title, content, emoji, options);
}
