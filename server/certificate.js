// certificate.js - HTTPS Certificate Generation and Management

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const selfsigned = require('selfsigned');

const CERT_PATH = path.join(__dirname, '..', 'cert.pem');
const KEY_PATH = path.join(__dirname, '..', 'key.pem');

/**
 * Get all local network IP addresses
 */
function getNetworkIPs() {
  const networkInterfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  return ips;
}

/**
 * Generate a self-signed certificate for HTTPS
 */
function generateCertificate() {
  console.log('Generating self-signed certificate...');

  // Get all network IPs
  const networkIPs = getNetworkIPs();

  // Build altNames array with localhost + all network IPs
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    { type: 7, ip: '::1' }
  ];

  // Add all network IPs to the certificate
  networkIPs.forEach(ip => {
    altNames.push({ type: 7, ip });
    console.log(`  Adding network IP to certificate: ${ip}`);
  });

  // Certificate attributes
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Shipping Manager Chat' },
    { name: 'countryName', value: 'US' }
  ];

  // Generate self-signed certificate
  const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 365,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: altNames
      }
    ]
  });

  // Save certificate and key
  fs.writeFileSync(CERT_PATH, pems.cert);
  fs.writeFileSync(KEY_PATH, pems.private);

  console.log('✓ Certificate generated successfully');
}

/**
 * Load or generate certificate
 */
function loadCertificate() {
  if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    generateCertificate();
  }

  return {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH)
  };
}

/**
 * Create HTTPS server
 */
function createHttpsServer(app) {
  const credentials = loadCertificate();
  return https.createServer(credentials, app);
}

module.exports = {
  createHttpsServer,
  loadCertificate
};
