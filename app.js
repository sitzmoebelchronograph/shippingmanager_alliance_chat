// app.js - Shipping Manager Alliance Chat Web App (HTTPS)

const express = require('express');
const os = require('os');
require('dotenv').config();

// Server modules
const config = require('./server/config');
const { setupMiddleware } = require('./server/middleware');
const { initializeAlliance } = require('./server/utils/api');
const { createHttpsServer } = require('./server/certificate');
const { initWebSocket, startChatAutoRefresh } = require('./server/websocket');

// Route modules
const allianceRoutes = require('./server/routes/alliance');
const messengerRoutes = require('./server/routes/messenger');
const gameRoutes = require('./server/routes/game');

// Initialize Express app
const app = express();

// Setup middleware
setupMiddleware(app);

// Serve CA certificate for download
app.get('/ca-cert.pem', (req, res) => {
  res.download('./ca-cert.pem', 'ShippingManager-CA.pem', (err) => {
    if (err) {
      console.error('Error downloading CA certificate:', err);
      res.status(404).send('CA certificate not found');
    }
  });
});

// Setup routes
app.use('/api', allianceRoutes);
app.use('/api', messengerRoutes);
app.use('/api', gameRoutes);

// Create HTTPS server
const server = createHttpsServer(app);

// Initialize WebSocket
const wss = initWebSocket(server);

// HTTP Upgrade for WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Start server
server.listen(config.PORT, config.HOST, async () => {
  await initializeAlliance();

  // Start chat auto-refresh
  startChatAutoRefresh();

  // Display network addresses
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  console.log(`\n🚀 Shipping Manager Chat Server (HTTPS) running on:`);
  console.log(`   Local:   https://localhost:${config.PORT}`);
  if (addresses.length > 0) {
    addresses.forEach(addr => {
      console.log(`   Network: https://${addr}:${config.PORT}`);
    });
  }
  console.log(`\n⚠ Self-signed certificate - you need to accept the security warning in your browser\n`);
});
