// config.js - Application Configuration

module.exports = {
  PORT: 12345,
  HOST: '0.0.0.0',
  SHIPPING_MANAGER_API: 'https://shippingmanager.cc/api',
  SESSION_COOKIE: process.env.SHIPPING_MANAGER_COOKIE || 'PROVIDE YOUR SHIPPING_MANAGER_COOKIE IN AN .env FILE',

  // Rate limiting configuration
  RATE_LIMIT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    message: 'Too many requests, please try again later'
  },

  MESSAGE_RATE_LIMIT: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many messages, please wait before sending again'
  },

  // Chat auto-refresh interval (milliseconds)
  CHAT_REFRESH_INTERVAL: 25000
};
