// certificate.js - HTTPS Certificate Generation and Management

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');
const forge = require('node-forge');

const CA_CERT_PATH = path.join(__dirname, '..', 'ca-cert.pem');
const CA_KEY_PATH = path.join(__dirname, '..', 'ca-key.pem');
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
 * Generate Certificate Authority (CA)
 */
function generateCA() {
  console.log('Generating Certificate Authority (CA)...');

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName', value: 'Shipping Manager Chat CA' },
    { name: 'organizationName', value: 'Shipping Manager Chat' },
    { name: 'countryName', value: 'US' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true
    }
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const caPem = forge.pki.certificateToPem(cert);
  const caKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  fs.writeFileSync(CA_CERT_PATH, caPem);
  fs.writeFileSync(CA_KEY_PATH, caKeyPem);

  console.log('✓ CA generated successfully');

  // Try to install CA certificate automatically on Windows
  if (os.platform() === 'win32') {
    try {
      console.log('\n🔒 Installing CA certificate to Windows Trust Store...');
      console.log('   (Admin rights required - UAC dialog will appear)\n');

      execSync(`powershell -Command "Start-Process certutil -ArgumentList '-addstore','-f','Root','${CA_CERT_PATH}' -Verb RunAs -Wait"`, {
        stdio: 'inherit'
      });

      console.log('\n✓ CA certificate installed successfully!');
      console.log('✓ Browser will now trust all certificates from this CA\n');
    } catch (error) {
      console.log('\n⚠ Installation cancelled or failed');
      console.log('📋 Manual installation:');
      console.log(`   1. Right-click Command Prompt → "Run as Administrator"`);
      console.log(`   2. Run: certutil -addstore -f "Root" "${CA_CERT_PATH}"\n`);
    }
  } else if (os.platform() === 'darwin') {
    console.log(`\n📋 macOS: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${CA_CERT_PATH}"\n`);
  } else {
    console.log(`\n📋 Linux: sudo cp "${CA_CERT_PATH}" /usr/local/share/ca-certificates/ && sudo update-ca-certificates\n`);
  }

  return { cert: caPem, key: caKeyPem };
}

/**
 * Generate server certificate signed by CA
 */
function generateCertificate() {
  console.log('Generating server certificate...');

  // Load or generate CA
  let caCert, caKey;
  if (!fs.existsSync(CA_CERT_PATH) || !fs.existsSync(CA_KEY_PATH)) {
    const ca = generateCA();
    caCert = forge.pki.certificateFromPem(ca.cert);
    caKey = forge.pki.privateKeyFromPem(ca.key);
  } else {
    caCert = forge.pki.certificateFromPem(fs.readFileSync(CA_CERT_PATH, 'utf8'));
    caKey = forge.pki.privateKeyFromPem(fs.readFileSync(CA_KEY_PATH, 'utf8'));
  }

  // Generate server key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Shipping Manager Chat' },
    { name: 'countryName', value: 'US' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(caCert.subject.attributes);

  // Get all network IPs
  const networkIPs = getNetworkIPs();

  // Build altNames array
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    { type: 7, ip: '::1' }
  ];

  networkIPs.forEach(ip => {
    altNames.push({ type: 7, ip });
    console.log(`  Adding network IP to certificate: ${ip}`);
  });

  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: altNames
    }
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  fs.writeFileSync(CERT_PATH, certPem);
  fs.writeFileSync(KEY_PATH, keyPem);

  console.log('✓ Server certificate generated successfully');
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
