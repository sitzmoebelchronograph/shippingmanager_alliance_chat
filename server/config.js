/**
 * @fileoverview Centralized configuration for Shipping Manager application.
 * Contains all server settings, API endpoints, rate limiting rules, and timing intervals.
 * Session cookie is loaded from environment variable (injected by run.js).
 *
 * Important configuration notes:
 * - Server listens on 0.0.0.0 (all network interfaces) for LAN access
 * - Rate limits are set conservatively to avoid API detection
 * - Chat refresh interval is 25 seconds (within the 29-minute price window)
 * - Session cookie provides full account access - never log or expose it
 *
 * @module server/config
 */

module.exports = {
  /**
   * HTTPS server port. Uses non-standard port to avoid conflicts.
   * @constant {number}
   * @default 12345
   */
  PORT: 12345,

  /**
   * Server bind address. 0.0.0.0 allows access from all network interfaces (localhost + LAN).
   * @constant {string}
   * @default '0.0.0.0'
   */
  HOST: '0.0.0.0',

  /**
   * Base URL for Shipping Manager game API. All proxy requests are sent to this endpoint.
   * @constant {string}
   * @default 'https://shippingmanager.cc/api'
   */
  SHIPPING_MANAGER_API: 'https://shippingmanager.cc/api',

  /**
   * Session cookie for API authentication. Loaded from process.env (injected by run.js).
   * Provides full account access - must be kept secure and never logged.
   * @constant {string}
   */
  SESSION_COOKIE: process.env.SHIPPING_MANAGER_COOKIE || 'PROVIDE YOUR SHIPPING_MANAGER_COOKIE IN AN .env FILE',

  /**
   * Global rate limiting configuration for all API endpoints.
   * Prevents API abuse and reduces detection risk.
   *
   * @typedef {Object} RateLimitConfig
   * @property {number} windowMs - Time window in milliseconds (15 minutes)
   * @property {number} max - Maximum requests allowed per window (1000 requests)
   * @property {string} message - Error message shown when limit exceeded
   */
  RATE_LIMIT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    message: 'Too many requests, please try again later'
  },

  /**
   * Message-specific rate limiting configuration (stricter than global limit).
   * Applied to alliance chat and private messaging endpoints.
   *
   * @typedef {Object} MessageRateLimitConfig
   * @property {number} windowMs - Time window in milliseconds (1 minute)
   * @property {number} max - Maximum messages allowed per window (30 messages)
   * @property {string} message - Error message shown when limit exceeded
   */
  MESSAGE_RATE_LIMIT: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many messages, please wait before sending again'
  },

  /**
   * WebSocket chat auto-refresh interval in milliseconds.
   * Server broadcasts updated chat feed to all connected clients every 25 seconds.
   * This timing is critical for the 29-minute fuel/CO2 purchase window strategy.
   *
   * @constant {number}
   * @default 25000
   */
  CHAT_REFRESH_INTERVAL: 25000
};
