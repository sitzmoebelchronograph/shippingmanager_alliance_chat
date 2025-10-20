# Shipping Manager Alliance Chat Tool

## Problem Statement

When playing [Shipping Manager](http://shippingmanager.cc/) on Steam, the in-game alliance chat suffers from a critical page reload bug. Typing certain characters causes the entire game page to refresh, making communication with alliance members nearly impossible. Messages get lost mid-typing, disrupting coordination and team play.

This tool provides a standalone web-based chat interface that connects directly to the Shipping Manager API, allowing you to chat with your alliance members without experiencing the game's input bugs.

## Features

- **Real-time Alliance Chat**: WebSocket-based live chat updates
- **Member Mentions**: Use `@` to mention alliance members with autocomplete
- **Message History**: View complete chat feed with timestamps
- **No Page Reloads**: Type freely without triggering game bugs
- **Auto-refresh**: Chat updates every 25 seconds automatically
- **Character Counter**: Track message length (1000 char limit)
- **Multi-line Support**: Use Shift+Enter for line breaks

## Requirements

### All Platforms
- Node.js 14.0 or higher
- npm (Node Package Manager)
- Modern web browser
- Active Shipping Manager account with alliance membership

## Installation

### Step 1: Clone or Download
```bash
git clone https://github.com/yourusername/shipping-manager-chat.git
cd shipping-manager-chat
```

Or download and extract the ZIP file.

### Step 2: Install Dependencies
```bash
npm install express ws axios dotenv helmet validator express-rate-limit
```

### Step 3: Configure Session Cookie

Since Shipping Manager runs in Steam's built-in browser, you need a network traffic interceptor to capture the session cookie.

#### Windows - Using Fiddler

1. Download and install [Fiddler Classic](https://www.telerik.com/download/fiddler)
2. Start Fiddler
3. In Fiddler, go to Tools → Options → HTTPS
4. Enable "Decrypt HTTPS traffic"
5. Start Shipping Manager in Steam
6. In Fiddler, look for requests to `shippingmanager.cc`
7. Click on a request and go to the "Inspectors" tab
8. In the "Headers" section, find `Cookie: shipping_manager_session=...`
9. Copy the cookie value (everything after `shipping_manager_session=`)

#### Linux - Using mitmproxy

1. Install mitmproxy:
   - Debian/Ubuntu: sudo apt install mitmproxy
   - Arch: sudo pacman -S mitmproxy
   - Fedora: sudo dnf install mitmproxy

2. Start mitmproxy:
   - Run: mitmproxy --set confdir=~/.mitmproxy

3. Configure Steam to use proxy:
   - Steam → Settings → Web Browser
   - Set HTTP Proxy to `127.0.0.1:8080`

4. Start Shipping Manager in Steam
5. In mitmproxy, look for requests to `shippingmanager.cc`
6. Press Enter on the request to view details
7. Press `q` to go to request headers
8. Find the `Cookie` header with `shipping_manager_session`
9. Copy the cookie value

#### macOS - Using Charles Proxy

1. Download and install [Charles Proxy](https://www.charlesproxy.com/download/)
2. Start Charles
3. Go to Proxy → SSL Proxying Settings
4. Add `shippingmanager.cc` to the locations
5. Install Charles Root Certificate (Help → SSL Proxying → Install Charles Root Certificate)
6. Start Shipping Manager in Steam
7. In Charles, find requests to `shippingmanager.cc`
8. Right-click the request → View Request
9. Go to the "Headers" tab
10. Copy the `shipping_manager_session` cookie value

#### Alternative: Using Wireshark (All Platforms)

1. Download and install [Wireshark](https://www.wireshark.org/download.html)
2. Start capture on your network interface
3. Filter: http.host == "shippingmanager.cc"
4. Start Shipping Manager in Steam
5. Find HTTP requests to the API
6. Expand "Hypertext Transfer Protocol" → "Cookie"
7. Copy the `shipping_manager_session` value

**Note**: For HTTPS decryption in Wireshark, you'll need to configure SSLKEYLOGFILE environment variable.

7. Create a `.env` file in the project root:
```env
SHIPPING_MANAGER_COOKIE=your_cookie_value_here
```

**Note**: The cookie expires periodically. You'll need to update it when you get authentication errors.

### Step 4: Run the Application

#### Windows
```cmd
node allychat.js
```

#### Linux/macOS
```bash
node allychat.js
```

The server will start on `http://localhost:12345`

## Usage

1. **Start the Server**: Run `node allychat.js`
2. **Open Browser**: Navigate to `http://localhost:12345`
3. **Wait for Connection**: The app will load your alliance data
4. **Start Chatting**: Type messages and hit Enter to send
5. **Mention Members**: Type `@` to see member suggestions
6. **Multi-line Messages**: Use Shift+Enter for line breaks

## API Endpoints

The tool provides several REST API endpoints:

- `GET /api/chat` - Fetch current chat feed
- `POST /api/send-message` - Send a message to alliance chat
- `POST /api/company-name` - Get company name by user ID
- `GET /api/alliance-members` - List all alliance members

## WebSocket Features

The tool uses WebSocket for real-time updates:
- Automatic chat refresh when new messages arrive
- Connection status indicator
- Instant message delivery notifications

## File Structure
```
shipping-manager-chat/
├── allychat.js          # Main server application
├── index.html           # Web interface (served from root)
├── .env                 # Session cookie configuration
├── package.json         # Node.js dependencies
└── README.md           # This file
```

## Security Features

- Rate limiting to prevent spam
- Input sanitization and validation
- XSS protection via HTML escaping
- Helmet.js for security headers
- Message length limits (1000 chars)

## Troubleshooting

### Authentication Failed
- Your session cookie has expired
- Get a new cookie from the game and update `.env`

### Port 12345 Already in Use
```javascript
// In allychat.js, change:
const PORT = 12345;
// To any available port:
const PORT = 8080;
```

### Cannot Load Alliance
- Ensure you're a member of an alliance in the game
- Check your session cookie is valid
- Verify network connectivity to shippingmanager.cc

### Messages Not Sending
- Check browser console for errors
- Ensure message is under 1000 characters
- Verify server is running without errors

### WebSocket Connection Failed
- Check firewall settings
- Ensure both HTTP and WS protocols are allowed
- Try disabling browser extensions

## Configuration

Edit these values in `allychat.js`:
```javascript
const PORT = 12345;                              // Server port
const SHIPPING_MANAGER_API = 'https://shippingmanager.cc/api';  // API endpoint
```

## Rate Limits

- General requests: 100 per 15 minutes
- Message sending: 5 per minute

## Known Limitations

- Requires manual cookie updates when session expires
- Cannot receive notifications when browser tab is inactive
- Limited to text chat (no images/files)
- Must keep server running locally

## Development

### Adding Features
The codebase is modular and easy to extend:
- API calls are centralized in `apiCall()` function
- WebSocket broadcasting via `broadcast()` function
- Rate limiting middleware can be adjusted

### Debug Mode
Enable detailed logging:
```javascript
console.log('Debug:', data);  // Add throughout code
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Test thoroughly with your alliance
4. Submit a pull request

## Security Notice

**Never share your session cookie publicly!** The cookie provides full access to your Shipping Manager account. Keep your `.env` file private and add it to `.gitignore`.

## License

MIT License - Use at your own risk

## Disclaimer

This tool is not affiliated with Shipping Manager or Steam. It's a community-created workaround for the known chat bug. Use responsibly and in accordance with the game's terms of service.

## Support

For issues or questions:
- Check existing issues on GitHub
- Contact the Shipping Manager community
- Review the game's official forums

---

**Important**: This tool will become obsolete once the developers fix the page reload bug. Check for game updates regularly. The tool is intended as a temporary solution to maintain alliance communication.
