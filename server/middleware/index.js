// middleware/index.js - Application Middleware

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Setup all middleware for the Express app
 */
function setupMiddleware(app) {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    originAgentCluster: false
  }));

  // Body parser middleware
  app.use(express.json({ limit: '1kb' }));

  // Static files
  app.use(express.static('public'));

  // Global rate limiter
  const limiter = rateLimit(config.RATE_LIMIT);
  app.use(limiter);
}

/**
 * Message-specific rate limiter
 */
const messageLimiter = rateLimit(config.MESSAGE_RATE_LIMIT);

module.exports = {
  setupMiddleware,
  messageLimiter
};
