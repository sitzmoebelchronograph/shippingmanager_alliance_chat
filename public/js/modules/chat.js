/**
 * @fileoverview Alliance Chat Module - Manages real-time alliance chat functionality with WebSocket support,
 * message rendering, mention autocomplete, and notification handling. This module provides the core
 * communication interface for alliance members to collaborate and coordinate in the Shipping Manager game.
 *
 * Key Features:
 * - Real-time chat updates via WebSocket (server broadcasts every 25 seconds)
 * - User mention system with @username autocomplete (converts to [user_id] format)
 * - Mixed message types: chat messages and system feed events (member joins, route completions)
 * - Smart auto-scroll behavior (maintains position while scrolling up to read history)
 * - Desktop notifications for new messages when window is not focused
 * - Company name caching to reduce API calls
 *
 * Message Flow:
 * 1. Messages loaded from REST API on initial page load
 * 2. WebSocket pushes updates every 25 seconds from server
 * 3. New messages trigger notifications if window not focused
 * 4. Duplicate messages filtered by type+timestamp+content comparison
 *
 * Mention System:
 * - Typing "@" triggers autocomplete with alliance member list
 * - Selecting member inserts [user_id] into message
 * - Server converts [user_id] to @CompanyName on broadcast
 * - Clicking @CompanyName opens private messenger
 *
 * @module chat
 * @requires utils - HTML escaping, feedback, and notification functions
 * @requires api - Backend API calls for chat data and company names
 */

import { escapeHtml, showFeedback, handleNotifications } from './utils.js';
import { getCompanyNameCached, fetchChat, sendChatMessage, fetchAllianceMembers } from './api.js';

/**
 * Array of all chat messages and feed events.
 * Maintained in chronological order. Contains both 'chat' and 'feed' type messages.
 * @type {Array<Object>}
 */
let allMessages = [];

/**
 * Array of alliance members for mention autocomplete.
 * Populated on chat load. Each member has user_id and company_name properties.
 * @type {Array<{user_id: number, company_name: string}>}
 */
let allianceMembers = [];

/**
 * Auto-scroll flag controlling scroll-to-bottom behavior.
 * Set to true when user sends message or is near bottom. Prevents forced scrolling when reading history.
 * @type {boolean}
 */
let autoScroll = true;

/**
 * Parses message text and converts user ID mentions to clickable company name links.
 * Handles the mention system by converting [user_id] patterns to @CompanyName with click handlers.
 *
 * Processing Steps:
 * 1. Escape HTML to prevent XSS attacks
 * 2. Find all [user_id] patterns in the message
 * 3. Fetch company names for all mentioned users (cached API calls)
 * 4. Replace [user_id] with clickable @CompanyName elements
 * 5. Convert newlines to <br> tags
 *
 * Side Effects:
 * - Makes cached API calls to resolve company names
 * - Returns HTML with embedded click handlers
 *
 * @async
 * @param {string} text - Raw message text from API (may contain [user_id] mentions)
 * @returns {Promise<string>} HTML string with mentions converted to clickable links
 *
 * @example
 * // Input: "Hey [123], check out the prices!"
 * // Output: 'Hey <strong class="company-name" data-user-id="123">@CompanyName</strong>, check out the prices!'
 */
export async function parseMessageWithMentions(text) {
  let htmlMessage = escapeHtml(text);
  const mentionIdRegex = /\[(\d+)\]/g;

  let replacementPromises = [];

  const matches = [...htmlMessage.matchAll(mentionIdRegex)];
  matches.forEach(match => {
    const userId = parseInt(match[1]);
    replacementPromises.push(getCompanyNameCached(userId));
  });

  const resolvedNames = await Promise.all(replacementPromises);
  let i = 0;

  htmlMessage = htmlMessage.replace(mentionIdRegex, (match, userId) => {
    const companyName = resolvedNames[i++];
    return `<strong class="company-name" data-user-id="${userId}" style="cursor:pointer;">@${escapeHtml(companyName)}</strong>`;
  });

  return htmlMessage.replace(/\n/g, '<br>');
}

/**
 * Loads and displays alliance chat messages with intelligent duplicate filtering and notifications.
 * This is the core function called both on page load and via WebSocket updates every 25 seconds.
 *
 * Update Strategy:
 * - Fetches latest messages from API
 * - Filters out duplicates using type+timestamp+message comparison
 * - Only re-renders if new messages found
 * - Preserves scroll position unless user is at bottom
 * - Triggers desktop notifications for new messages (if window not focused)
 *
 * No Alliance Handling:
 * - Shows friendly message if user not in alliance
 * - Disables input controls
 * - Suggests using private messages instead
 *
 * Side Effects:
 * - Updates allMessages array
 * - Re-renders chat feed DOM
 * - May trigger desktop notifications
 * - Updates scroll position based on user behavior
 * - May disable input controls if no alliance
 *
 * @async
 * @param {HTMLElement} chatFeed - Chat container DOM element to render messages into
 * @returns {Promise<void>}
 *
 * @example
 * // Called on page load and via WebSocket updates
 * const chatFeed = document.getElementById('chatFeed');
 * loadMessages(chatFeed);
 */
export async function loadMessages(chatFeed) {
  const isScrolledToBottom = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight < 50;

  try {
    const data = await fetchChat();

    if (data.no_alliance) {
      chatFeed.innerHTML = `
        <div class="empty-message" style="max-width: 500px; margin: 0 auto;">
          <div style="font-size: 48px; margin-bottom: 20px;">🤝</div>
          <h2 style="color: #60a5fa; margin-bottom: 15px; font-size: 20px;">Hey Dude, You're Not in an Alliance!</h2>
          <p style="color: #9ca3af; line-height: 1.6;">
            Join an alliance to see the alliance chat here and communicate with your fellow shipping managers.
          </p>
          <p style="color: #9ca3af; margin-top: 10px; font-size: 14px;">
            You can still use private messages via the 📬 button above.
          </p>
        </div>
      `;
      const messageInput = document.getElementById('messageInput');
      const sendMessageBtn = document.getElementById('sendMessageBtn');
      messageInput.disabled = true;
      messageInput.placeholder = "Join an alliance to chat...";
      sendMessageBtn.disabled = true;
      return;
    }

    const newMessages = data.messages || data;

    const newOnly = newMessages.filter(msg =>
      !allMessages.some(existing =>
        existing.type === msg.type && existing.timestamp === msg.timestamp && existing.message === msg.message
      )
    );

    if (newOnly.length > 0 || allMessages.length === 0) {
      allMessages = newMessages;
      await displayMessages(allMessages, chatFeed);

      if (newOnly.length > 0) {
        handleNotifications(newOnly);
      }
    }

    if (isScrolledToBottom || autoScroll) {
      chatFeed.scrollTop = chatFeed.scrollHeight;
      autoScroll = false;
    }

  } catch (error) {
    console.error('Error loading messages:', error);
    if (allMessages.length === 0) {
      chatFeed.innerHTML = '<div class="empty-message" style="color:#ef4444;">Could not connect to chat server.</div>';
    }
  }
}

/**
 * Renders messages to the DOM with appropriate formatting for chat and feed types.
 * Handles asynchronous mention parsing and registers click events for company names.
 *
 * Message Types:
 * - 'chat': User messages with company name, timestamp, and parsed mentions
 * - 'feed': System events (member joins, route completions) with different styling
 *
 * Processing Flow:
 * 1. Check if messages array is empty
 * 2. Map each message to HTML promise (async mention parsing)
 * 3. Await all HTML promises in parallel
 * 4. Render all messages at once (prevents DOM thrashing)
 * 5. Register click events on company names for messenger integration
 *
 * Side Effects:
 * - Replaces entire chatFeed innerHTML
 * - Registers click event listeners on company names
 * - Shows "No messages yet" if array is empty
 *
 * @async
 * @param {Array<Object>} messagesToDisplay - Array of message objects to render
 * @param {string} messagesToDisplay[].type - Message type: 'chat' or 'feed'
 * @param {HTMLElement} chatFeed - Container element to render messages into
 * @returns {Promise<void>}
 */
export async function displayMessages(messagesToDisplay, chatFeed) {
  if (!messagesToDisplay || messagesToDisplay.length === 0) {
    chatFeed.innerHTML = '<div class="empty-message">No messages yet</div>';
    return;
  }

  const messageHtmlPromises = messagesToDisplay.map(async msg => {
    if (msg.type === 'chat') {
      const userId = parseInt(msg.user_id);
      const parsedMessage = await parseMessageWithMentions(msg.message);

      return `
        <div class="message">
          <div class="message-header">
            <span class="company-name" data-user-id="${userId}" style="cursor:pointer;">${escapeHtml(msg.company)}</span>
            <span class="timestamp">${msg.timestamp}</span>
          </div>
          <div class="message-text">${parsedMessage}</div>
        </div>
      `;
    } else if (msg.type === 'feed') {
      return `
        <div class="message feed">
          <div class="message-header">
            <span>SYSTEM: ${msg.feedType}</span>
            <span class="timestamp">${msg.timestamp}</span>
          </div>
          <div class="message-text">${escapeHtml(msg.company)}</div>
        </div>
      `;
    }
  });

  const messageHtmls = await Promise.all(messageHtmlPromises);
  chatFeed.innerHTML = messageHtmls.join('');

  registerUsernameClickEvents();
}

/**
 * Sends a chat message to the alliance feed with validation and UI updates.
 * Handles the complete flow from user input to API submission and UI refresh.
 *
 * Validation:
 * - Trims whitespace
 * - Enforces 1-1000 character limit
 * - Prevents empty messages
 *
 * Processing Flow:
 * 1. Validate message content
 * 2. Disable input controls (prevents double-send)
 * 3. Submit to API
 * 4. Clear input and reset UI state
 * 5. Enable auto-scroll for new message
 * 6. Refresh chat after 500ms delay
 * 7. Re-enable controls
 *
 * Side Effects:
 * - Disables/enables message input and send button
 * - Clears message input on success
 * - Resets textarea height to auto
 * - Updates character count display
 * - Sets autoScroll flag to true
 * - Triggers chat reload after 500ms
 * - Shows success/error feedback
 *
 * @async
 * @param {HTMLTextAreaElement} messageInput - Textarea element for message input
 * @param {HTMLElement} charCount - Element showing character count
 * @param {HTMLButtonElement} sendMessageBtn - Send button element
 * @param {HTMLElement} chatFeed - Chat container for reloading messages
 * @returns {Promise<void>}
 */
export async function sendMessage(messageInput, charCount, sendMessageBtn, chatFeed) {
  const message = messageInput.value.trim();
  if (!message || message.length > 1000) {
    showFeedback('Invalid message length or content.', 'error');
    return;
  }

  sendMessageBtn.disabled = true;
  messageInput.disabled = true;

  try {
    await sendChatMessage(message);

    messageInput.value = '';
    messageInput.style.height = 'auto';
    charCount.textContent = '0 / 1000 characters';
    showFeedback('Message sent!', 'success');
    autoScroll = true;

    setTimeout(() => loadMessages(chatFeed), 500);
  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
  } finally {
    sendMessageBtn.disabled = false;
    messageInput.disabled = false;
    handleMessageInput(messageInput, charCount);
  }
}

/**
 * Loads alliance members list for mention autocomplete functionality.
 * Fetches and caches the member list in module-level variable for autocomplete suggestions.
 *
 * @async
 * @returns {Promise<Array<{user_id: number, company_name: string}>>} Array of alliance members
 *
 * @example
 * // Called on chat initialization
 * const members = await loadAllianceMembers();
 * // members = [{ user_id: 123, company_name: "Company A" }, ...]
 */
export async function loadAllianceMembers() {
  allianceMembers = await fetchAllianceMembers();
  return allianceMembers;
}

/**
 * Handles message input changes including auto-resize, character count, and mention autocomplete.
 * Called on every input event in the message textarea.
 *
 * Features:
 * - Auto-resizes textarea up to 240px max height
 * - Updates character count with warning/error states
 * - Triggers mention autocomplete when "@" is typed
 *
 * Character Count States:
 * - Normal: 0-900 characters (default style)
 * - Warning: 901-1000 characters (yellow)
 * - Error: >1000 characters (red)
 *
 * Side Effects:
 * - Adjusts textarea height based on content
 * - Updates character count element text and style
 * - Triggers mention autocomplete overlay
 *
 * @param {HTMLTextAreaElement} messageInput - Message textarea element
 * @param {HTMLElement} charCount - Character count display element
 */
export function handleMessageInput(messageInput, charCount) {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 240) + 'px';

  const currentLength = messageInput.value.length;
  charCount.textContent = `${currentLength} / 1000 characters`;
  charCount.className = 'char-count';

  if (currentLength > 900) {
    charCount.classList.add(currentLength > 1000 ? 'error' : 'warning');
  }

  handleMentionAutocomplete(messageInput);
}

function handleMentionAutocomplete(messageInput) {
  const text = messageInput.value;
  const match = text.match(/@([^\s\n]*)$/);
  if (match) {
    const query = match[1].toLowerCase();

    const filteredMembers = allianceMembers.filter(member =>
      member.company_name.toLowerCase().includes(query)
    ).slice(0, 10);

    displaySuggestions(filteredMembers, text.lastIndexOf('@'), messageInput);
  } else {
    hideMemberSuggestions();
  }
}

function displaySuggestions(members, atIndex, messageInput) {
  let suggestionBox = document.getElementById('memberSuggestions');
  if (!suggestionBox) {
    suggestionBox = document.createElement('div');
    suggestionBox.id = 'memberSuggestions';
    const inputWrapper = document.querySelector('.input-wrapper') || messageInput.parentElement;
    inputWrapper.appendChild(suggestionBox);
  }

  if (members.length === 0) {
    hideMemberSuggestions();
    return;
  }

  suggestionBox.innerHTML = members.map(member => `
    <div class="member-suggestion" data-user-id="${member.user_id}" data-company="${escapeHtml(member.company_name)}">
      ${escapeHtml(member.company_name)}
    </div>
  `).join('');

  suggestionBox.querySelectorAll('.member-suggestion').forEach(item => {
    item.addEventListener('click', () => {
      insertMention(item.dataset.userId, atIndex, messageInput);
      hideMemberSuggestions();
    });
  });

  suggestionBox.style.display = 'block';
}

function hideMemberSuggestions() {
  const suggestionBox = document.getElementById('memberSuggestions');
  if (suggestionBox) {
    suggestionBox.style.display = 'none';
  }
}

function insertMention(userId, atIndex, messageInput) {
  const text = messageInput.value;
  const beforeAt = text.substring(0, atIndex);
  const newText = beforeAt + `[${userId}] ` + text.substring(text.length);

  messageInput.value = newText;
  messageInput.focus();
  const charCount = document.getElementById('charCount');
  handleMessageInput(messageInput, charCount);
}

function registerUsernameClickEvents() {
  document.querySelectorAll('.company-name').forEach(nameElement => {
    const userId = parseInt(nameElement.dataset.userId);
    const companyName = nameElement.textContent.replace(/^@/, '');

    if (userId && !nameElement.hasAttribute('data-has-click-handler')) {
      nameElement.setAttribute('data-has-click-handler', 'true');
      nameElement.addEventListener('click', () => {
        if (window.openMessengerFromChat) {
          window.openMessengerFromChat(companyName, userId);
        }
      });
    }
  });
}

/**
 * Initializes WebSocket connection for real-time chat updates.
 * Establishes WSS connection and handles incoming message broadcasts from server.
 *
 * WebSocket Message Types:
 * - 'chat_update': Server broadcasts new messages every 25 seconds
 * - 'message_sent': Immediate update when any user sends a message
 * - 'settings_update': Broadcasts when settings change (triggers global callback)
 *
 * Connection Strategy:
 * - Uses WSS for HTTPS pages, WS for HTTP
 * - Connects to same host as the page
 * - Fails silently if WebSocket not available
 *
 * Side Effects:
 * - Creates WebSocket connection
 * - Registers onmessage event handler
 * - Triggers loadMessages() on chat updates
 * - Calls global handleSettingsUpdate() callback if available
 *
 * @example
 * // Called once on page load
 * initWebSocket();
 * // Server broadcasts every 25 seconds: { type: 'chat_update', data: [...messages] }
 */
export function initWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    const chatFeed = document.getElementById('chatFeed');
    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      if (type === 'chat_update' || type === 'message_sent') {
        loadMessages(chatFeed);
      } else if (type === 'settings_update') {
        if (window.handleSettingsUpdate) {
          window.handleSettingsUpdate(data);
        }
      }
    };
  } catch (e) {
    console.error('WebSocket not available:', e);
  }
}

/**
 * Sets up scroll event listener to manage auto-scroll behavior intelligently.
 * Detects when user is near the bottom of chat to enable automatic scrolling for new messages.
 *
 * Auto-Scroll Logic:
 * - Enabled when user is within 50px of bottom
 * - Disabled when user scrolls up to read history
 * - Prevents forced scrolling while user is browsing old messages
 *
 * This provides a good UX where new messages automatically scroll into view when user
 * is already at the bottom, but doesn't interrupt reading when scrolled up.
 *
 * Side Effects:
 * - Registers scroll event listener on chat feed
 * - Updates module-level autoScroll flag
 *
 * @param {HTMLElement} chatFeed - Chat container element to monitor
 *
 * @example
 * // Called once on page load
 * const chatFeed = document.getElementById('chatFeed');
 * setChatScrollListener(chatFeed);
 */
export function setChatScrollListener(chatFeed) {
  chatFeed.addEventListener('scroll', () => {
    autoScroll = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight < 50;
  });
}
