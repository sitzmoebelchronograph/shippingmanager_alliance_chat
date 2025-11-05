/**
 * @fileoverview Build Installer Script
 *
 * Compiles the WPF installer and creates final release artifacts.
 * Run after: npm run build:all (which creates app-payload.zip)
 *
 * Creates:
 * - dist/ShippingManagerCoPilot-Installer-v{version}.exe
 * - dist/checksums.txt (SHA256 hashes)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const packageJson = require('./package.json');
const version = packageJson.version;

const distFolder = path.join(__dirname, 'dist');
const installerProject = path.join(__dirname, 'installer');
const payloadZipPath = path.join(installerProject, 'Resources', 'app-payload.zip');

console.log('='.repeat(60));
console.log('Building ShippingManager CoPilot Installer');
console.log('='.repeat(60));
console.log(`Version: ${version}`);
console.log();

// Check prerequisites
console.log('[1/5] Checking prerequisites...');

// Check for app-payload.zip
if (!fs.existsSync(payloadZipPath)) {
    console.error('  [ERROR] app-payload.zip not found!');
    console.error('  Location: installer/Resources/app-payload.zip');
    console.error('  Run: node build-package.js first');
    process.exit(1);
}
const payloadSizeInMB = (fs.statSync(payloadZipPath).size / 1024 / 1024).toFixed(2);
console.log(`  [OK] app-payload.zip found (${payloadSizeInMB} MB)`);

// Check for .NET SDK
try {
    const dotnetVersion = execSync('dotnet --version', { encoding: 'utf8' }).trim();
    console.log(`  [OK] .NET SDK found (${dotnetVersion})`);
} catch (error) {
    console.error('  [ERROR] .NET SDK not found!');
    console.error('  Install from: https://dotnet.microsoft.com/download');
    console.error('  Required: .NET 8.0 SDK or later');
    process.exit(1);
}

// Restore dependencies
console.log('[2/5] Restoring .NET dependencies...');
try {
    execSync('dotnet restore installer', { stdio: 'inherit' });
    console.log('  [OK] Dependencies restored');
} catch (error) {
    console.error('  [ERROR] Failed to restore dependencies');
    process.exit(1);
}

// Build installer
console.log('[3/5] Building installer...');
try {
    const buildCommand = 'dotnet publish installer -c Release -r win-x64 --self-contained -p:PublishSingleFile=true';
    console.log(`  Running: ${buildCommand}`);
    execSync(buildCommand, { stdio: 'inherit' });
    console.log('  [OK] Installer built successfully');
} catch (error) {
    console.error('  [ERROR] Failed to build installer');
    process.exit(1);
}

// Find and copy Setup.exe + DLLs
console.log('[4/5] Copying installer files...');
const publishFolder = path.join(installerProject, 'bin', 'Release', 'net8.0-windows10.0.19041.0', 'win-x64', 'publish');
const setupExePath = path.join(publishFolder, 'Setup.exe');

if (!fs.existsSync(setupExePath)) {
    console.error('  [ERROR] Setup.exe not found!');
    console.error(`  Expected location: ${setupExePath}`);
    process.exit(1);
}

// Create dist/installer folder for all installer files
const installerDistFolder = path.join(distFolder, 'installer');
if (!fs.existsSync(installerDistFolder)) {
    fs.mkdirSync(installerDistFolder, { recursive: true });
}

// Copy ALL files from publish folder (exe + WPF native DLLs)
console.log('  Copying installer files from publish folder...');
const publishFiles = fs.readdirSync(publishFolder);
let totalSize = 0;

for (const file of publishFiles) {
    const srcPath = path.join(publishFolder, file);
    const destPath = path.join(installerDistFolder, file);

    if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        totalSize += fs.statSync(destPath).size;

        // Rename Setup.exe to ShippingManagerCoPilot-Installer.exe
        if (file === 'Setup.exe') {
            const renamedPath = path.join(installerDistFolder, `ShippingManagerCoPilot-Installer-v${version}.exe`);
            fs.renameSync(destPath, renamedPath);
            console.log(`  [OK] ${file} -> ShippingManagerCoPilot-Installer-v${version}.exe`);
        } else {
            console.log(`  [OK] ${file}`);
        }
    }
}

const installerOutputPath = path.join(installerDistFolder, `ShippingManagerCoPilot-Installer-v${version}.exe`);
const totalSizeInMB = (totalSize / 1024 / 1024).toFixed(2);
console.log(`  [OK] All installer files copied (${totalSizeInMB} MB total)`);
console.log(`  Location: ${installerDistFolder}`);

// Generate checksums
console.log('[5/5] Generating checksums...');

function generateSHA256(filePath) {
    const hash = crypto.createHash('sha256');
    const fileBuffer = fs.readFileSync(filePath);
    hash.update(fileBuffer);
    return hash.digest('hex');
}

const installerHash = generateSHA256(installerOutputPath);
const checksumFile = path.join(distFolder, 'checksums.txt');

const checksumContent = `SHA256 Checksums - ShippingManager CoPilot v${version}
${'='.repeat(60)}

ShippingManagerCoPilot-Installer-v${version}.exe
${installerHash}

Generated: ${new Date().toISOString()}
`;

fs.writeFileSync(checksumFile, checksumContent);
console.log('  [OK] Checksums generated');
console.log(`  Location: ${checksumFile}`);

console.log();
console.log('='.repeat(60));
console.log('[SUCCESS] Installer build complete!');
console.log('='.repeat(60));
console.log(`Installer: dist/installer/ShippingManagerCoPilot-Installer-v${version}.exe`);
console.log(`Total size: ${totalSizeInMB} MB (exe + WPF DLLs)`);
console.log(`SHA256: ${installerHash}`);
console.log();
console.log('IMPORTANT: The installer requires ALL files in dist/installer/ to run!');
console.log('  - ShippingManagerCoPilot-Installer-v' + version + '.exe');
console.log('  - D3DCompiler_47_cor3.dll, PenImc_cor3.dll, etc.');
console.log('  Distribute the entire dist/installer/ folder or create a ZIP.');
console.log();
console.log('Next steps:');
console.log('  1. Test installer locally: cd dist/installer && start ShippingManagerCoPilot-Installer-v' + version + '.exe');
console.log('  2. Create git tag: git tag v' + version);
console.log('  3. Push tag: git push origin v' + version);
console.log('  4. GitHub Actions will create release automatically');
console.log();
