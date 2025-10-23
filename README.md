# Shipping Manager - CoPilot

A comprehensive standalone web application for [Shipping Manager](http://shippingmanager.cc/) that fixes the game's critical chat bug and adds powerful automation features.

## 🎯 Key Features at a Glance

- ✅ **Bug-Free Chat**: Alliance chat and private messaging without page reload bugs
- 🤖 **AutoPilot System**: Intelligent automation for fuel/CO2 purchasing, vessel operations, and campaign management with configurable intervals
- 📱 **Mobile Support**: Full HTTPS support with mobile notifications
- 🚢 **Fleet Management**: Vessel purchasing, bulk repairs, automated departures, and alliance cooperation
- 💰 **Smart Purchasing**: Price alerts, auto-rebuy, and detailed cost calculations
- 🤝 **Alliance Cooperation**: Manage and send coop vessels to alliance members
- 🔒 **Secure**: Rate-limited API calls, input validation, and anti-detection mechanisms

## Problem Statement

When playing [Shipping Manager](http://shippingmanager.cc/) on Steam, the in-game chat suffers from a critical page reload bug. Typing certain characters causes the entire game page to refresh, making communication with alliance members nearly impossible. Messages get lost mid-typing, disrupting coordination and team play.

This tool provides a comprehensive standalone web interface that connects directly to the Shipping Manager API, offering alliance chat, private messaging, game management features, **and intelligent automation** - all without the game's input bugs :)

## Features

### Alliance Chat
- **Real-time Alliance Chat**: WebSocket-based live chat updates with randomized intervals (25-27s) for stealth
- **Member Mentions**: Use `@` to mention alliance members with autocomplete suggestions
- **Instant Message Display**: See your sent messages immediately in the chat feed
- **Message History**: View complete chat feed with timestamps
- **Feed Events**: See alliance member joins and route completions
- **No Page Reloads**: Type freely without triggering game bugs
- **Character Counter**: Track message length (1000 char limit)
- **Multi-line Support**: Use Shift+Enter for line breaks
- **Click to Chat**: Click on any company name in the chat to start a private conversation
- **No Alliance Support**: Gracefully handles users not in an alliance

### Private Messaging
- **Private Conversations**: Send and receive private messages to/from other players
- **Message Inbox**: View all private conversations with unread count badge
- **Chat Selection**: Choose between multiple conversations with the same user (different subjects)
- **New Messages**: Start new conversations with custom subjects
- **Instant Updates**: Messages appear immediately after sending
- **Contact List**: Access all your contacts and alliance members
  - Separate sections for regular contacts and alliance contacts
  - Alphabetically sorted lists
  - Quick "Send Message" buttons
  - Direct access to start conversations

### Game Management
- **Points Display**: Real-time premium points balance
- **CEO Level Badge**: Display your current CEO level with a golden star badge
- **Cash Display**: Real-time cash balance with auto-updates every 30 seconds
- **Stock Display**:
  - Real-time stock value and trend indicator (only visible if IPO active)
  - Green up arrow (↑) for rising stock prices
  - Red down arrow (↓) for falling stock prices
  - Auto-updates every 30 seconds
- **Anchor Slots Display**:
  - Shows available/max vessel capacity (e.g., "7/101")
  - Available = max anchor points - total vessels owned
  - Helps plan vessel purchases without hitting limits
  - Auto-updates every 30 seconds
- **Fuel Management**:
  - Current fuel level and capacity display
  - One-click max fuel purchase with detailed confirmation dialog
  - Price per ton display (turns green when ≤ $400/t)
  - Configurable price alerts with browser notifications
  - Smart purchase calculations
- **CO2 Management**:
  - Current CO2 quota and capacity display
  - One-click max CO2 purchase with detailed confirmation dialog
  - Price per ton display (turns green when ≤ $7/t)
  - Configurable price alerts with browser notifications
  - Smart purchase calculations
- **Vessel Management**:
  - Real-time count of vessels ready to depart
  - Separate badge for vessels at anchor
  - **Pending Vessels Badge**: Track vessels under construction with countdown timers
  - **Pending Vessels Filter**: View all vessels being built with completion times
  - One-click "Depart All" with detailed feedback
  - Shows fuel/CO2 consumption and earnings per departure
  - Auto-refresh every 30 seconds
- **Bulk Repair**:
  - Automatic detection of vessels with high wear
  - Configurable wear threshold (10% or 20%)
  - One-click bulk repair with cost preview
  - Real-time badge showing number of vessels needing repair
  - Prevents repair if insufficient funds
- **Marketing Campaigns**:
  - View all available marketing campaigns
  - Real-time campaign status (active/inactive)
  - One-click campaign activation
  - Badge shows number of available campaigns
  - Detailed campaign information display
- **Vessel Purchase Catalog**:
  - Browse all available vessels for purchase
  - Filter by vessel type (Container/Tanker) or engine type
  - Engine type filter shows all matching vessels regardless of container/tanker type
  - Sorted by price (cheapest first)
  - Detailed vessel specifications:
    - Type, Year, Capacity, Speed, Range
    - Engine type and power (e.g., "mih_x1 (60,000 kW)")
    - Length, Fuel capacity
    - Service interval, Current port
    - **Efficiency Color Coding**: CO2 and Fuel factors with visual indicators
      - 🟢 Green: Factor < 1.0 (efficient, below standard consumption)
      - ⚪ Gray: Factor = 1.0 (standard efficiency)
      - 🟠 Orange: Factor > 1.0 (inefficient, above standard consumption)
    - Special features (Gearless, Antifouling)
    - Width (if applicable), Perks (if available)
  - High-quality vessel images
  - Quantity selection (1-99 vessels per purchase)
  - Individual vessel purchase with confirmation
  - Select multiple vessels for bulk purchase
  - Comprehensive purchase confirmation dialogs
- **Bulk Vessel Purchasing**:
  - Select multiple vessels with different quantities
  - Visual selection indicator shows quantity (e.g., "✓ Selected (10x)")
  - Badge shows total vessel count in selection
  - Sequential purchase with 1.5s delay between each
  - Detailed purchase summary showing all vessels and costs
  - Automatic stop on vessel limit or insufficient funds
  - Clear error messages with purchased count
  - Auto-refresh vessel list after purchases

### Alliance Cooperation 🤝

- **Coop Management Interface**:
  - Header display shows available/cap ratio (e.g., "17/68")
  - Color-coded status: Green when all sent (0 available), Red when vessels need sending
  - Button badge shows available count only when > 0
  - Real-time stats: available, cap, sent this season, received this season
- **Member List**:
  - Shows only enabled alliance members
  - Sorted by total vessel count (highest first)
  - Displays user ID, total vessels, and fuel amount
  - Visual indicator (✓) for members with real purchases
  - Border color coding: Green for purchasers, Gray for others
- **Coop Actions**:
  - One-click "Send max" button per member
  - Placeholder functionality (ready for API implementation)
  - Success feedback notifications

### AutoPilot - Intelligent Automation System 🤖

**Smart automation features with anti-detection mechanisms and event-driven architecture:**

- **Auto-Rebuy Fuel**:
  - Monitors fuel prices continuously (every 30-35 seconds)
  - Automatically purchases fuel when price drops at/below configured threshold
  - Configurable threshold (default: $400/ton)
  - Can use alert threshold or custom threshold
  - Event-driven: Triggers immediately when price drops
  - Continues buying until bunker is full or funds depleted
  - Pure price-based strategy (no time windows)

- **Auto-Rebuy CO2**:
  - Monitors CO2 prices continuously (every 30-35 seconds)
  - Automatically purchases CO2 when price drops at/below configured threshold
  - Configurable threshold (default: $7/ton)
  - Can use alert threshold or custom threshold
  - Event-driven: Triggers immediately when price drops
  - Continues buying until bunker is full or funds depleted
  - Pure price-based strategy (no time windows)

- **Auto-Depart All Vessels**:
  - Continuously monitors vessels in port
  - Automatically departs all ready vessels when fuel is available
  - Detects failed departures (insufficient fuel/CO2)
  - Shows green success notification for successful departures
  - Shows red error notification for failed departures ("🤖 Auto-Depart\nNo fuel - no vessels sent")
  - Random 1-2 minute intervals between checks
  - Prevents API spam with intelligent timing

- **Auto Bulk Repair**:
  - Monitors all vessels for wear/maintenance needs
  - Automatically repairs all vessels with wear > 0%
  - Only repairs when sufficient funds are available
  - **Configurable Check Interval**: Choose from 0-1h to 12-24h ranges
  - Random check within selected time range (e.g., 2-3 hours = random check between 2-3h)
  - Server-side execution ensures repairs happen even when browser is closed
  - Detailed cost preview before repair

- **Auto Campaign Renewal**:
  - Monitors active marketing campaigns
  - Automatically renews expired campaigns (reputation, awareness, green)
  - Random 2-3 minute intervals between checks
  - Prevents campaign downtime
  - Only activates when funds are sufficient

- **Anti-Detection Features**:
  - Randomized check intervals (1-3 minutes for main loop)
  - Event-driven rebuy (triggered by price updates, not polling)
  - Rate-limited API calls with random delays
  - Human-like behavior patterns
  - Prevents account flagging

- **AutoPilot Notifications**:
  - Optional browser notifications for all automation actions
  - Toggle in settings to enable/disable
  - Shows fuel/CO2 purchases, departures, repairs, campaign renewals
  - Desktop and mobile support
  - Visual feedback in UI for all actions

### Settings & Customization
- **Price Alert Thresholds**:
  - Customizable fuel price alert threshold (default: $400/ton)
  - Customizable CO2 price alert threshold (default: $7/ton)
  - Browser notification test button
- **AutoPilot Settings**:
  - Enable/disable auto-rebuy fuel
  - Enable/disable auto-rebuy CO2
  - Enable/disable auto-depart all vessels
  - Enable/disable auto bulk repair (with configurable interval: 0-1h to 12-24h)
  - Enable/disable auto campaign renewal
  - Enable/disable AutoPilot notifications
  - Configurable thresholds (use alert threshold or custom value)
- **Maintenance Settings**:
  - Configurable wear threshold for automatic repair detection
  - Options: 10% or 20% wear threshold
  - Configurable auto-repair check interval (0-1h, 1-2h, 2-3h, 3-4h, 4-5h, 5-6h, 6-12h, 12-24h)
- **Persistent Settings**: All preferences saved in settings.json on server (survives restarts)
- **Real-Time Sync**: Settings changes broadcast to all connected clients via WebSocket (multi-tab/multi-device sync)

### Advanced Features
- **Smart Purchase Dialogs**: Detailed confirmation dialogs showing:
  - Amount needed to fill tank/storage
  - Current price per ton
  - Total cost calculation
  - Current cash balance validation
  - Line-by-line vessel list for bulk purchases
  - Visual separator and summary section
  - Cancel/Confirm buttons in header for quick access
- **Browser Notifications**: Desktop and mobile notifications for:
  - Price alerts when fuel/CO2 drops below thresholds
  - Animated price alert with spin effect on page
  - Test notification button in settings
  - **Mobile Support**: Works on Android/iOS with Service Worker
  - **Vibration Alerts**: Mobile devices vibrate on notifications
  - System notifications visible in device notification tray
- **HTTPS Support**:
  - Self-signed certificates with automatic generation
  - Network IP addresses included in certificate
  - Accessible from all devices on local network
  - CA certificate download in settings for mobile devices
- **Debounced API Calls**: Rate-limited requests to avoid detection (800-1000ms delays)
- **Randomized Intervals**: Variable polling times to appear more human-like
- **Extended Feedback**: Success/error messages with multi-line support
- **Responsive Design**: Modern dark theme with glassmorphism effects, optimized for desktop and mobile

***

## Legal Disclaimer & Risk Notice

**WARNING: USE OF THIS TOOL IS AT YOUR OWN RISK!**

This tool implements automated procedures to extract session cookies from the local Steam client cache and interacts directly with the game's API (`shippingmanager.cc`).

1.  **Violation of ToS:** These techniques **most likely** violate the Terms of Service (ToS) of both **Steam** and **Shipping Manager**.
2.  **Potential Consequences:** Use of this tool may lead to the **temporary suspension** or **permanent ban** of your Steam or game account.
3.  **No Liability:** The developers of this tool **assume no liability** for any damages or consequences resulting from its use. **Every user is solely responsible for complying with the respective terms of service.**

***

## Requirements

### All Platforms
- **Node.js** 22.0 or higher (required for native TLS certificate generation)
- **npm** (Node Package Manager)
- **Python** 3.7+ (with `pip`)
- **Modern web browser** (Chrome/Chromium recommended)
- Active Shipping Manager account on Steam (alliance membership optional)

### Windows (Required for Automated Cookie Extraction)
- **`pywin32`** and **`cryptography`** Python packages (installed in Step 2)
- **`selenium`**, **`opencv-python`**, **`pillow`** (optional, for demo video/screenshot generation)

***

## Installation & Setup

### Step 1: Clone or Download
Clone the repository and navigate into the directory:
```bash
git clone https://github.com/yourusername/shipping-manager-messenger.git
cd shipping-manager-messenger
```

### Step 2: Install Dependencies (Node.js & Python)
Install all necessary Node.js packages and the Windows-specific Python libraries for DPAPI decryption:
```bash
# Install Node.js packages
npm install

# Install Python packages for Windows decryption
pip install pywin32 cryptography

# Optional: Install packages for demo recording
pip install selenium opencv-python pillow
```

### Step 3: Automated Startup (No Manual Cookie Required!) 🚀

This tool uses an automated process to securely extract your current, encrypted Session Cookie directly from the Steam client cache.

#### ❗ Important Note on Initial Login State

The session cookie is **only generated and stored in the Steam cache** if you have **previously logged into the Steam client successfully** and **started the game `Shipping Manager` at least once**.

As long as the token remains valid (typically several weeks to months), you **do not need to repeat the Steam login process**, even if you restart or exit the Steam client.

#### Process Logic

The `run.js` wrapper script intelligently controls the startup process:

1.  **Stop:** The process attempts to terminate the Steam client to release the database lock.
2.  **Extract:** The cookie is retrieved from the unlocked database.
3.  **Start/Restart:**
    * If Steam was **already running** before the start, it will be **restarted** after cookie extraction.
    * If Steam was **not running** before the start, it will be **launched** after cookie extraction.

**Start Command:**
Use the wrapper script `run.js` to manage the entire process:
```bash
# This command executes run.js, which:
# 1. Kills Steam (if running).
# 2. Extracts the Session Cookie using the Python script.
# 3. Starts the app.js server with the fresh cookie in process.env.
# 4. Restarts Steam (if necessary, or launches it if not running).
node run.js
```

The server will be started at `https://localhost:12345`. Open this URL in your browser and accept the self-signed certificate warning.

***

## Configuration

The core configuration is located in `server/config.js`:

```javascript
module.exports = {
  PORT: 12345,
  HOST: '0.0.0.0',  // Listens on all network interfaces
  SHIPPING_MANAGER_API: 'https://shippingmanager.cc/api',
  SESSION_COOKIE: process.env.SHIPPING_MANAGER_COOKIE,  // Auto-injected by run.js

  // Rate limiting
  RATE_LIMIT: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 1000
  },

  // Chat auto-refresh interval
  CHAT_REFRESH_INTERVAL: 25000  // 25 seconds
};
```

### Settings (In-App)

Access settings via the ⚙️ button in the header:

- **Fuel Alert Threshold**: Set custom price threshold for fuel alerts (default: $400/ton)
- **CO2 Alert Threshold**: Set custom price threshold for CO2 alerts (default: $7/ton)
- **Maintenance Threshold**: Set wear percentage for automatic repair detection (10% or 20%)
- **Test Notifications**: Test browser notifications before enabling alerts
- **CA Certificate Download**: Download and install CA certificate for mobile devices (required for notifications on mobile)

***

## Certificate Authority (CA) Installation

The application automatically generates a Certificate Authority (CA) and signs the server certificate with it. This eliminates browser security warnings once the CA is installed.

### Automatic Installation (Windows Desktop)

On first startup, the application will:
1. Generate a new CA certificate (valid for 10 years)
2. Display a Windows UAC dialog requesting administrator privileges
3. Install the CA certificate into Windows Trust Store (Root Certification Authorities)
4. Generate a server certificate signed by the CA

**After installing the CA certificate, all browsers (Chrome, Edge, Firefox) will trust the HTTPS connection without warnings.**

### Manual Installation (if automatic installation fails)

If the UAC dialog is cancelled or fails:
1. Open Command Prompt as Administrator (Right-click → "Run as Administrator")
2. Run: `certutil -addstore -f "Root" "C:\path\to\project\ca-cert.pem"`

### Mobile Device Installation (Android/iOS)

**Required for browser notifications to work on mobile devices!**

1. Open the application in your mobile browser
2. Go to Settings (⚙️ button)
3. Scroll down to "🔒 Certificate Installation"
4. Tap "📥 Download CA Certificate"
5. Install the certificate:
   - **Android**: Settings → Security → Install Certificate → Select the downloaded file
   - **iOS**: Settings → Profile Downloaded → Install → Follow prompts

**Note**: Without the CA certificate installed, mobile browsers will not allow Service Worker registration, which is required for system notifications.

### Removing the CA Certificate

**Windows:**
1. Open Command Prompt as Administrator
2. Run: `certutil -delstore Root "Shipping Manager CoPilot CA"`

**Android:**
1. Settings → Security → Trusted Credentials → User
2. Find "Shipping Manager CoPilot CA" → Remove

**iOS:**
1. Settings → General → VPN & Device Management
2. Find "Shipping Manager CoPilot CA" → Remove Profile

### macOS Installation
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca-cert.pem
```

### Linux Installation
```bash
sudo cp ca-cert.pem /usr/local/share/ca-certificates/shipping-manager-chat-ca.crt
sudo update-ca-certificates
```

***

## Network Access

The application uses HTTPS with CA-signed certificates that include all your local network IP addresses. This allows you to access the application from any device on your local network:

1. Start the server with `node run.js` and install the CA certificate (one-time setup)
2. Note the network URLs displayed in the console (e.g., `https://192.168.1.100:12345`)
3. On another device, navigate to that URL
4. **No certificate warnings** after CA installation!
5. The app is now accessible across your local network

***

## Security Notice

**Your Session Cookie is extracted automatically and dynamically!** The manual step of saving the cookie in a `.env` file is no longer required, significantly **improving local security** by preventing the sensitive value from being permanently stored in a file.

**Never share the decrypted cookie publicly!** The cookie provides full, persistent access to your Shipping Manager account.

**Security Features:**
- Session cookie only stored in memory (process.env)
- HTTPS with self-signed certificates
- Input validation on all endpoints
- Rate limiting on API calls
- Helmet middleware for security headers

***

## Privacy & Data Collection

**This application collects ZERO data from users.**

- **No telemetry**: The software does not send any usage data, statistics, or analytics to the developer
- **No tracking**: Your gameplay data, account information, and activity remain completely private
- **Local only**: All data is stored locally on your machine (settings.json, session cookies in memory)
- **No external servers**: The application only communicates with shippingmanager.cc API - never with developer servers
- **Open source**: You can verify the code yourself - there are no hidden data collection mechanisms

**The developer has zero interest in your data.** This tool was created to solve a game bug, not to collect user information.

***

## Documentation

This project includes comprehensive JSDoc documentation for all modules and functions.

### Generate Documentation

```bash
# Generate HTML documentation
npm run docs
```

The documentation is automatically:
- **Generated before every commit** (via git pre-commit hook)
- **Served by the application** at `https://localhost:12345/docs/index.html`
- **Accessible via the 📖 button** in the UI (next to settings ⚙️)

The documentation includes:
- All backend modules (server routes, utilities, middleware)
- All frontend modules (API, automation, bunker management, chat, coop, messenger, vessel management, etc.)
- Function signatures, parameters, return values, and examples

**View Documentation:**
1. Start the application (`node run.js`)
2. Click the 📖 button in the UI, or
3. Navigate to `https://localhost:12345/docs/index.html`

***

## Project Structure

```
shippingmanager_messanger/
├── app.js                    # Main application entry point
├── run.js                    # Startup wrapper (handles Steam & cookie extraction)
├── server/
│   ├── config.js            # Centralized configuration
│   ├── certificate.js       # HTTPS certificate generation with CA
│   ├── middleware/          # Express middleware
│   ├── routes/              # API routes:
│   │   ├── alliance.js      # Alliance chat endpoints
│   │   ├── messenger.js     # Private messaging endpoints
│   │   ├── game.js          # Game management (vessels, fuel, CO2, campaigns)
│   │   ├── coop.js          # Alliance cooperation endpoints
│   │   └── settings.js      # Settings persistence (AutoPilot configuration)
│   ├── utils/               # Helper functions (API calls, caching)
│   └── websocket.js         # WebSocket server for real-time updates
├── helper/
│   └── get-session-from-steam-windows11.py  # Cookie extraction script
├── public/
│   ├── index.html           # Main application UI
│   ├── sw.js                # Service Worker for mobile notifications
│   ├── css/style.css        # Modern dark theme with glassmorphism
│   └── js/
│       ├── script.js        # Main application logic & initialization
│       └── modules/         # Modular ES6 architecture:
│           ├── api.js               # API communication layer
│           ├── automation.js        # AutoPilot system
│           ├── bunker-management.js # Fuel/CO2 management
│           ├── chat.js              # Alliance chat functionality
│           ├── coop.js              # Alliance cooperation management
│           ├── messenger.js         # Private messaging
│           ├── ui-dialogs.js        # Reusable dialog components
│           ├── utils.js             # Utility functions
│           └── vessel-management.js # Vessel operations
├── settings.json            # Persistent settings storage (auto-generated)
├── eslint.config.js         # ESLint configuration for code quality
└── screenshots/             # Screenshots for documentation
```

### Architecture Highlights

**Modular ES6 Frontend:**
- Clean separation of concerns with ES6 modules
- Each module handles specific domain logic (chat, vessels, automation)
- Shared utilities and API layer
- Easy to maintain and extend

**Secure Backend:**
- Fully documented with JSDoc comments
- Rate-limited API endpoints
- Input validation on all routes
- WebSocket for real-time updates
- HTTPS with CA-signed certificates

***

## Troubleshooting

### Certificate Warnings
The self-signed certificate will trigger browser warnings. This is expected and safe for local network use. Click "Advanced" → "Proceed to localhost" (or similar).

### Mobile Notifications Not Working
If browser notifications don't appear on your mobile device:
1. **Install CA Certificate**: Go to Settings → Certificate Installation → Download CA Certificate
2. **Enable Notifications**: Tap "🔔 Enable Notifications" button and grant permission
3. **Reload Page**: Hard refresh the page (clear cache) after installing certificate
4. **Check Browser Settings**: Ensure browser has notification permissions in device settings
5. **Test Notification**: Use "Test Browser Notification" button in settings

**Note**: Mobile Chrome requires CA certificate to be installed for Service Worker registration, which is necessary for notifications.

### Steam Not Restarting
If Steam doesn't restart automatically, check:
- Steam installation path matches default (`C:\Program Files (x86)\Steam\steam.exe`)
- You have permissions to start Steam

### Session Cookie Expired
If you get authentication errors:
1. Stop the server
2. Log into Shipping Manager via Steam
3. Restart the server with `node run.js`

### Network Access Issues
If you can't access from other devices:
1. Check your firewall allows connections on port 12345
2. Verify you're using the correct network IP address
3. Regenerate certificates: delete `cert.pem`, `key.pem`, `ca-cert.pem`, and `ca-key.pem`, then restart

### Vessel Purchase Issues
If vessel purchases fail:
- **Vessel Limit Reached**: The game has a maximum number of vessels you can own. The app will show exactly how many vessels were purchased before hitting the limit.
- **Insufficient Cash**: Make sure you have enough cash for the total purchase. The confirmation dialog shows both total cost and available cash.
- **Already Purchased**: If you try to purchase the same vessel again, it may not be available anymore. The vessel list auto-refreshes after successful purchases.
- **Network Errors**: Check your internet connection and that the game API is accessible.

All vessel purchase errors include detailed messages showing:
- Specific error reason (limit/cash/network)
- Number of vessels successfully purchased
- Clear next steps

***

## License

MIT License - Use at your own risk

## Disclaimer

This tool is not affiliated with Shipping Manager or Steam. It's a community-created workaround for the known chat bug.

***

## Application Preview

![Application Demo](screenshots/demo.gif)
