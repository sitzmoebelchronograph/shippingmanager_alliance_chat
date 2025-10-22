// public/js/script.js

// Global variables
const chatFeed = document.getElementById('chatFeed');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const charCount = document.getElementById('charCount');
const feedback = document.getElementById('feedback');
let allianceMembers = [];
let allMessages = [];
let autoScroll = true;

// Debouncing & Rate Limiting
let updateBunkerTimeout = null;
let updateVesselTimeout = null;
let updateUnreadTimeout = null;

// Messenger state
let currentPrivateChat = {
  chatId: null,
  subject: null,
  targetCompanyName: null,
  targetUserId: null,
  messages: [],
  isNewChat: false
};
const userCache = new Map();
let allPrivateChats = [];
let userChatsForSelection = [];

// Settings state
let settings = {
  fuelThreshold: 400,
  co2Threshold: 7,
  maintenanceThreshold: 10 // 10% or 20%
};

// Campaigns tracking
let lastCampaignsCount = null;

// Load settings from localStorage
function loadSettings() {
  const saved = localStorage.getItem('shippingManagerSettings');
  if (saved) {
    settings = { ...settings, ...JSON.parse(saved) };
  }
}

// Save settings to localStorage
function saveSettings() {
  localStorage.setItem('shippingManagerSettings', JSON.stringify(settings));
}

// --- Utility Functions ---

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function showFeedback(message, type) {
  const globalFeedback = document.getElementById('globalFeedback');

  // Check if a price alert is currently active
  const hasPriceAlert = globalFeedback.querySelector('#priceAlertMessage');

  if (hasPriceAlert) {
    // If price alert is active, show feedback below it temporarily
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = `global-feedback-message ${type}`;
    feedbackDiv.innerHTML = message;
    feedbackDiv.style.marginTop = '10px';
    globalFeedback.appendChild(feedbackDiv);

    setTimeout(() => {
      if (feedbackDiv.parentNode) {
        feedbackDiv.remove();
      }
    }, 6000);
  } else {
    // Normal feedback behavior
    globalFeedback.innerHTML = `<div class="global-feedback-message ${type}">${message}</div>`;
    globalFeedback.classList.add('show');

    setTimeout(() => {
      globalFeedback.classList.remove('show');
      setTimeout(() => {
        globalFeedback.innerHTML = '';
      }, 300);
    }, 6000);
  }
}

// Price alert with 29-minute timeout and "Got it" button
let priceAlertTimeout = null;

function showPriceAlert(message, type = 'warning') {
  console.log('[showPriceAlert] Called with type:', type, 'message:', message.substring(0, 50) + '...');
  const globalFeedback = document.getElementById('globalFeedback');

  if (!globalFeedback) {
    console.error('[showPriceAlert] globalFeedback element not found!');
    return;
  }

  // Clear any existing alert timeout
  if (priceAlertTimeout) {
    clearTimeout(priceAlertTimeout);
  }

  globalFeedback.innerHTML = `
    <div class="global-feedback-message ${type}" id="priceAlertMessage" style="transform: scale(0) rotate(0deg); opacity: 0;">
      <div style="width: 100%;">${message}</div>
      <button
        id="dismissPriceAlertBtn"
        style="display: block; margin: 0 auto; padding: 8px 20px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: white; cursor: pointer; font-weight: 600; transition: all 0.2s;"
        onmouseover="this.style.background='rgba(255,255,255,0.3)'"
        onmouseout="this.style.background='rgba(255,255,255,0.2)'"
      >
        Got it
      </button>
    </div>
  `;

  // Show container
  globalFeedback.style.display = 'block';

  // Force reflow to ensure initial state is applied
  const messageEl = document.getElementById('priceAlertMessage');
  messageEl.offsetHeight;

  // Trigger animation with Web Animations API
  messageEl.animate([
    { transform: 'scale(0) rotate(0deg)', opacity: 0 },
    { transform: 'scale(0.5) rotate(180deg)', opacity: 1, offset: 0.6 },
    { transform: 'scale(1) rotate(360deg)', opacity: 1 }
  ], {
    duration: 800,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    fill: 'forwards'
  });

  // Add click event to dismiss button
  const dismissBtn = document.getElementById('dismissPriceAlertBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      dismissPriceAlert();
    });
  }

  // Auto-dismiss after 29 minutes (1,740,000 ms)
  priceAlertTimeout = setTimeout(() => {
    globalFeedback.style.display = 'none';
    globalFeedback.innerHTML = '';
  }, 1740000);
}

function dismissPriceAlert() {
  const globalFeedback = document.getElementById('globalFeedback');

  if (priceAlertTimeout) {
    clearTimeout(priceAlertTimeout);
    priceAlertTimeout = null;
  }

  globalFeedback.style.display = 'none';
  globalFeedback.innerHTML = '';
}

function showConfirmDialog(options) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    const detailsHtml = options.details ? `
      <div class="confirm-dialog-details">
        ${options.details.map(detail => `
          <div class="confirm-dialog-detail-row">
            <span class="label">${escapeHtml(detail.label)}</span>
            <span class="value">${escapeHtml(detail.value)}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    dialog.innerHTML = `
      <div class="confirm-dialog-header">
        <h3>${escapeHtml(options.title || 'Confirm')}</h3>
      </div>
      <div class="confirm-dialog-body">
        <p>${escapeHtml(options.message)}</p>
        ${detailsHtml}
      </div>
      <div class="confirm-dialog-footer">
        <button class="confirm-dialog-btn cancel" data-action="cancel">Cancel</button>
        <button class="confirm-dialog-btn confirm" data-action="confirm">${escapeHtml(options.confirmText || 'Confirm')}</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const handleClick = (e) => {
      const action = e.target.dataset.action;
      if (action === 'confirm' || action === 'cancel') {
        document.body.removeChild(overlay);
        resolve(action === 'confirm');
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    });

    dialog.addEventListener('click', handleClick);
  });
}

function handleMessageInput() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 240) + 'px';

  const currentLength = messageInput.value.length;
  charCount.textContent = `${currentLength} / 1000 characters`;
  charCount.className = 'char-count';

  if (currentLength > 900) {
    charCount.classList.add(currentLength > 1000 ? 'error' : 'warning');
  }

  handleMentionAutocomplete();
}

// --- Mention Autocomplete Functions ---

async function handleMentionAutocomplete() {
  const text = messageInput.value;
  const match = text.match(/@([^\s\n]*)$/);
  if (match) {
    const query = match[1].toLowerCase();
    
    const filteredMembers = allianceMembers.filter(member =>
      member.company_name.toLowerCase().includes(query)
    ).slice(0, 10);
    
    displaySuggestions(filteredMembers, text.lastIndexOf('@'));
  } else {
    hideMemberSuggestions();
  }
}

function displaySuggestions(members, atIndex) {
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
      insertMention(item.dataset.userId, atIndex);
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

function insertMention(userId, atIndex) {
  const text = messageInput.value;
  const beforeAt = text.substring(0, atIndex);
  const newText = beforeAt + `[${userId}] ` + text.substring(text.length);

  messageInput.value = newText;
  messageInput.focus();
  handleMessageInput();
}

// --- API Functions ---

async function getCompanyNameCached(userId) {
  const userIdInt = parseInt(userId);
  if (userCache.has(userIdInt)) {
    return userCache.get(userIdInt);
  }

  try {
    const response = await fetch('/api/company-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userIdInt })
    });

    if (!response.ok) throw new Error('Failed to get company name');
    const data = await response.json();
    const name = data.company_name;
    userCache.set(userIdInt, name);
    return name;
  } catch {
    return `User ${userIdInt}`;
  }
}

async function parseMessageWithMentions(text) {
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

// --- Alliance Chat Functions ---

async function loadMessages() {
  const isScrolledToBottom = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight < 50;

  try {
    const response = await fetch('/api/chat');
    if (!response.ok) throw new Error('Failed to load chat feed');
    const data = await response.json();

    // Check if user is not in an alliance
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
      // Disable send button and input
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
      await displayMessages(allMessages);

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

async function displayMessages(messagesToDisplay) {
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

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || message.length > 1000) {
    showFeedback('Invalid message length or content.', 'error');
    return;
  }

  sendMessageBtn.disabled = true;
  messageInput.disabled = true;

  try {
    const response = await fetch('/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';
    charCount.textContent = '0 / 1000 characters';
    showFeedback('Message sent!', 'success');
    autoScroll = true;

    setTimeout(loadMessages, 500);
  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
  } finally {
    sendMessageBtn.disabled = false;
    messageInput.disabled = false;
    handleMessageInput();
  }
}

async function fetchAllianceMembers() {
  try {
    const response = await fetch('/api/alliance-members');
    if (!response.ok) throw new Error('Failed to load alliance members');
    allianceMembers = await response.json();
  } catch (error) {
    console.error('Error loading alliance members:', error);
  }
}

// --- Private Messenger Functions ---

function registerUsernameClickEvents() {
  document.querySelectorAll('.company-name').forEach(nameElement => {
    const userId = parseInt(nameElement.dataset.userId);
    const companyName = nameElement.textContent.replace(/^@/, '');

    if (userId && !nameElement.hasAttribute('data-has-click-handler')) {
      nameElement.setAttribute('data-has-click-handler', 'true');
      nameElement.addEventListener('click', () => {
        openMessenger(companyName, userId);
      });
    }
  });
}

async function openMessenger(targetCompanyName, targetUserId) {
  try {
    // Get all chats
    const response = await fetch('/api/messenger/get-chats');
    if (!response.ok) throw new Error('Failed to get chats');

    const data = await response.json();
    allPrivateChats = data.chats;

    // Find all chats with this user (can be multiple with different subjects)
    const userChats = allPrivateChats.filter(chat => {
      if (chat.system_chat) return false;
      return chat.participants_string === targetCompanyName;
    });

    // Always show selection dialog
    showChatSelection(targetCompanyName, targetUserId, userChats, data.own_user_id);

  } catch (error) {
    console.error('Error opening messenger:', error);
    alert(`Error: ${error.message}`);
  }
}

function showChatSelection(targetCompanyName, targetUserId, chats, ownUserId) {
  // Sort chats by time_last_message (newest first)
  const sortedChats = [...chats].sort((a, b) => (b.time_last_message || 0) - (a.time_last_message || 0));
  userChatsForSelection = sortedChats;

  // Store for "New Conversation" option
  currentPrivateChat.targetCompanyName = targetCompanyName;
  currentPrivateChat.targetUserId = targetUserId;

  document.getElementById('chatSelectionTitle').textContent = `Conversations with ${targetCompanyName}`;
  const listContainer = document.getElementById('chatSelectionList');

  // Build HTML: "New Conversation" first, then existing chats
  let html = `
    <div class="chat-selection-item" data-is-new="true" style="border-color: #4ade80;">
      <h3 style="color: #4ade80;">+ Start New Conversation</h3>
      <p>Create a new conversation with a custom subject</p>
    </div>
  `;

  html += sortedChats.map((chat, index) => {
    const lastMsg = chat.last_message ? escapeHtml(chat.last_message.substring(0, 60)) + '...' : 'No messages';
    const subject = chat.subject || 'No subject';

    return `
      <div class="chat-selection-item" data-chat-index="${index}">
        <h3>${escapeHtml(subject)}</h3>
        <p>${lastMsg}</p>
      </div>
    `;
  }).join('');

  listContainer.innerHTML = html;

  // Add click handlers
  listContainer.querySelectorAll('.chat-selection-item').forEach(item => {
    item.addEventListener('click', async () => {
      if (item.dataset.isNew === 'true') {
        // New conversation
        document.getElementById('chatSelectionOverlay').style.display = 'none';
        openNewChat(targetCompanyName, targetUserId);
      } else {
        // Existing chat
        const chatIndex = parseInt(item.dataset.chatIndex);
        const selectedChat = userChatsForSelection[chatIndex];
        document.getElementById('chatSelectionOverlay').style.display = 'none';
        openExistingChat(targetCompanyName, targetUserId, selectedChat, ownUserId);
      }
    });
  });

  document.getElementById('chatSelectionOverlay').style.display = 'flex';
}

async function openExistingChat(targetCompanyName, targetUserId, chat, ownUserId) {
  currentPrivateChat = {
    chatId: chat.id,
    subject: chat.subject || 'Message',
    targetCompanyName: targetCompanyName,
    targetUserId: targetUserId,
    messages: [],
    isNewChat: false
  };

  document.getElementById('messengerOverlay').style.display = 'flex';
  document.getElementById('messengerTitle').textContent = `${targetCompanyName} - ${chat.subject || 'Chat'}`;
  document.getElementById('subjectInputWrapper').style.display = 'none';
  document.getElementById('messengerFeed').innerHTML = '<div class="empty-message">Loading...</div>';

  // Load messages
  await loadPrivateMessages(chat.id);

  // Update unread badge after opening chat (might mark as read)
  setTimeout(() => debouncedUpdateUnreadBadge(1000), 1000);

  document.getElementById('messengerInput').focus();
}

function openNewChat(targetCompanyName, targetUserId) {
  currentPrivateChat = {
    chatId: null,
    subject: null,
    targetCompanyName: targetCompanyName,
    targetUserId: targetUserId,
    messages: [],
    isNewChat: true
  };

  document.getElementById('messengerOverlay').style.display = 'flex';
  document.getElementById('messengerTitle').textContent = `New conversation with ${targetCompanyName}`;
  document.getElementById('subjectInputWrapper').style.display = 'block';
  document.getElementById('subjectInput').value = '';
  document.getElementById('messengerFeed').innerHTML =
    '<div class="empty-message">New conversation. Enter a subject and send your first message.</div>';

  document.getElementById('subjectInput').focus();
}

async function loadPrivateMessages(chatId) {
  try {
    const response = await fetch('/api/messenger/get-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId })
    });

    if (!response.ok) throw new Error('Failed to load messages');
    const { messages, user_id: ownUserId } = await response.json();

    displayPrivateMessages(messages, ownUserId);

  } catch (error) {
    document.getElementById('messengerFeed').innerHTML =
      `<div class="empty-message" style="color:#ef4444;">Error loading messages: ${error.message}</div>`;
  }
}

function displayPrivateMessages(messages, ownUserId) {
  const feed = document.getElementById('messengerFeed');
  feed.innerHTML = '';

  if (!messages || messages.length === 0) {
    feed.innerHTML = '<div class="empty-message">No messages in this chat yet.</div>';
    return;
  }

  // Don't reverse - display in order they come from API
  messages.forEach(msg => {
    const isOwn = msg.user_id === ownUserId;
    const bubble = document.createElement('div');

    const date = new Date(msg.created_at * 1000);
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const day = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

    bubble.className = `message-bubble ${isOwn ? 'own' : 'other'}`;
    bubble.innerHTML = `
      ${escapeHtml(msg.body || '').replace(/\n/g, '<br>')}
      <div style="font-size:10px; opacity:0.7; margin-top:5px; text-align:${isOwn ? 'right' : 'left'};">${day} ${time}</div>
    `;

    feed.appendChild(bubble);
  });

  feed.scrollTop = feed.scrollHeight;
}

function closeMessenger() {
  document.getElementById('messengerOverlay').style.display = 'none';
  currentPrivateChat = { chatId: null, subject: null, targetCompanyName: null, targetUserId: null, messages: [], isNewChat: false };
  document.getElementById('messengerFeed').innerHTML = '';
  document.getElementById('messengerInput').value = '';
  document.getElementById('subjectInput').value = '';
  document.getElementById('subjectInputWrapper').style.display = 'none';
}

function closeChatSelection() {
  document.getElementById('chatSelectionOverlay').style.display = 'none';
  userChatsForSelection = [];
}

// --- Contact List ---

async function showContactList() {
  try {
    const response = await fetch('/api/contact/get-contacts');
    if (!response.ok) throw new Error('Failed to get contacts');

    const data = await response.json();
    const contacts = data.contacts || [];
    const allianceContacts = data.alliance_contacts || [];

    const listContainer = document.getElementById('contactListFeed');

    if (contacts.length === 0 && allianceContacts.length === 0) {
      listContainer.innerHTML = '<div class="empty-message">No contacts found.</div>';
    } else {
      const renderContactList = (contactsList) => {
        return contactsList.map((contact) => {
          const contactName = contact.company_name || `User ${contact.id}`;
          const userId = contact.id;

          return `
            <div class="contact-row">
              <div class="contact-name-cell">
                <span class="contact-name">${escapeHtml(contactName)}</span><span class="contact-id"> (${userId})</span>
              </div>
              <div class="contact-button-cell">
                <button class="contact-send-btn" data-user-id="${userId}" data-company-name="${escapeHtml(contactName)}">
                  📩 Send
                </button>
              </div>
            </div>
          `;
        }).join('');
      };

      let html = '';

      // Regular Contacts section FIRST
      if (contacts.length > 0) {
        html += `
          <div class="contact-section">
            <h3 class="contact-section-title">Contacts</h3>
            <div class="contact-table">
              ${renderContactList(contacts)}
            </div>
          </div>
        `;
      }

      // Alliance Contacts section SECOND
      if (allianceContacts.length > 0) {
        html += `
          <div class="contact-section">
            <h3 class="contact-section-title">Alliance Contacts</h3>
            <div class="contact-table">
              ${renderContactList(allianceContacts)}
            </div>
          </div>
        `;
      }

      listContainer.innerHTML = html;

      // Add click handlers for send buttons
      listContainer.querySelectorAll('.contact-send-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = parseInt(btn.dataset.userId);
          const companyName = btn.dataset.companyName;

          document.getElementById('contactListOverlay').style.display = 'none';
          openNewChat(companyName, userId);
        });
      });
    }

    document.getElementById('contactListOverlay').style.display = 'flex';

  } catch (error) {
    console.error('Error loading contact list:', error);
    alert(`Error: ${error.message}`);
  }
}

function closeContactList() {
  document.getElementById('contactListOverlay').style.display = 'none';
}

// --- Settings ---

function showSettings() {
  // Load current settings into inputs
  document.getElementById('fuelThreshold').value = settings.fuelThreshold;
  document.getElementById('co2Threshold').value = settings.co2Threshold;
  document.getElementById('maintenanceThreshold').value = settings.maintenanceThreshold;
  document.getElementById('settingsOverlay').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none';
}

function renderStars(percentage) {
  // Each star represents 20%
  const fullStars = Math.floor(percentage / 20);
  const remainder = percentage % 20;
  const partialPercent = (remainder / 20) * 100; // How much of the next star to fill
  const emptyStars = 5 - fullStars - (remainder > 0 ? 1 : 0);

  let stars = '';

  // Full stars (gold filled)
  for (let i = 0; i < fullStars; i++) {
    stars += '<span style="color: #fbbf24;">⭐</span>';
  }

  // Partial star (if any) - use gradient
  if (remainder > 0) {
    stars += `
      <span style="
        background: linear-gradient(to right, #fbbf24 0%, #fbbf24 ${partialPercent}%, rgba(156, 163, 175, 0.2) ${partialPercent}%, rgba(156, 163, 175, 0.2) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      ">⭐</span>
    `;
  }

  // Empty stars (transparent/gray)
  for (let i = 0; i < emptyStars; i++) {
    stars += '<span style="color: rgba(156, 163, 175, 0.2);">⭐</span>';
  }

  return stars;
}

async function showCampaignsOverlay() {
  try {
    const response = await fetch('/api/marketing/get-campaigns');
    if (!response.ok) throw new Error('Failed to fetch campaigns');

    const data = await response.json();
    const allCampaigns = data.data.marketing_campaigns || [];
    const activeCampaigns = data.data.active_campaigns || [];
    const activeTypes = new Set(activeCampaigns.map(c => c.option_name));
    const totalReputation = data.user.reputation || 0; // Get actual reputation from API

    const contentDiv = document.getElementById('campaignsContent');
    const requiredTypes = ['reputation', 'awareness', 'green'];

    let html = '';

    // Show 5-star reputation indicator
    html += `
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 10px;">
          Company Reputation
        </div>
        <div style="font-size: 32px; margin-bottom: 8px; line-height: 1;">
          ${renderStars(totalReputation)}
        </div>
        <div style="font-size: 18px; color: #10b981; font-weight: 600;">
          ${totalReputation}%
        </div>
      </div>
    `;

    // Show active campaigns first
    if (activeCampaigns.length > 0) {
      html += `
        <div style="margin-bottom: 30px;">
          <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #10b981;">
            ✅ Active Campaigns
          </h3>
          <div style="display: flex; flex-direction: column; gap: 10px;">
      `;

      activeCampaigns.forEach(campaign => {
        const typeName = campaign.option_name.charAt(0).toUpperCase() + campaign.option_name.slice(1);
        const typeIcon = campaign.option_name === 'reputation' ? '⭐' : campaign.option_name === 'awareness' ? '📢' : '🌱';
        const efficiency = `${campaign.increase}%`;
        const duration = campaign.duration;

        // Calculate remaining time
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = campaign.end_time - now;
        const hoursLeft = Math.floor(timeLeft / 3600);
        const minutesLeft = Math.floor((timeLeft % 3600) / 60);
        const timeLeftStr = `${hoursLeft}h ${minutesLeft}m`;

        html += `
          <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="color: #10b981; font-size: 14px; font-weight: 600;">
                ${typeIcon} ${typeName}
              </div>
              <div style="color: #10b981; font-size: 12px; font-weight: 600;">
                ${timeLeftStr} remaining
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; color: #9ca3af; font-size: 12px;">
              <span>Duration: ${duration}h</span>
              <span>Efficiency: ${efficiency}</span>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Show available campaigns for inactive types
    const inactiveTypes = requiredTypes.filter(type => !activeTypes.has(type));

    if (inactiveTypes.length > 0) {
      inactiveTypes.forEach(type => {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        const typeIcon = type === 'reputation' ? '⭐' : type === 'awareness' ? '📢' : '🌱';
        const typeCampaigns = allCampaigns.filter(c => c.option_name === type);

        html += `
          <div style="margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #e0e0e0;">
              ${typeIcon} ${typeName} Campaigns
            </h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
        `;

        typeCampaigns.forEach(campaign => {
          const duration = campaign.campaign_duration;
          const efficiency = `${campaign.min_efficiency}-${campaign.max_efficiency}%`;
          const price = formatNumber(campaign.price);

          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(31, 41, 55, 0.5); border-radius: 8px; gap: 15px;">
              <div style="flex: 1;">
                <div style="color: #e0e0e0; font-size: 14px; font-weight: 600; margin-bottom: 4px;">
                  ${duration}h Duration
                </div>
                <div style="color: #9ca3af; font-size: 12px;">
                  Efficiency: ${efficiency}
                </div>
              </div>
              <div style="text-align: right; margin-right: 10px;">
                <div style="color: #4ade80; font-size: 14px; font-weight: 600;">
                  $${price}
                </div>
              </div>
              <button
                onclick="buyCampaign(${campaign.id}, '${typeName}', ${duration}, ${campaign.price})"
                style="
                  padding: 8px 16px;
                  background: rgba(16, 185, 129, 0.2);
                  border: 1px solid rgba(16, 185, 129, 0.4);
                  border-radius: 6px;
                  color: #10b981;
                  cursor: pointer;
                  font-weight: 600;
                  font-size: 13px;
                  transition: all 0.2s;
                  white-space: nowrap;
                "
                onmouseover="this.style.background='rgba(16, 185, 129, 0.3)'"
                onmouseout="this.style.background='rgba(16, 185, 129, 0.2)'"
              >
                Buy
              </button>
            </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });
    }

    contentDiv.innerHTML = html;
    document.getElementById('campaignsOverlay').style.display = 'flex';
  } catch (error) {
    console.error('Error showing campaigns overlay:', error);
    showFeedback('Failed to load campaigns', 'error');
  }
}

function closeCampaignsOverlay() {
  document.getElementById('campaignsOverlay').style.display = 'none';
}

window.buyCampaign = async function(campaignId, typeName, duration, price) {
  const confirmed = await showConfirmDialog({
    title: '📊 Activate Campaign',
    message: `Do you want to activate this ${typeName} campaign?`,
    confirmText: 'Activate',
    details: [
      { label: 'Type', value: typeName },
      { label: 'Duration', value: `${duration} hours` },
      { label: 'Cost', value: `$${formatNumber(price)}` }
    ]
  });

  if (!confirmed) return;

  try {
    const response = await fetch('/api/marketing/activate-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId })
    });

    if (!response.ok) throw new Error('Failed to activate campaign');

    const data = await response.json();

    showFeedback(`✅ ${typeName} campaign activated for ${duration} hours!`, 'success');

    // Close overlay and refresh campaign status
    closeCampaignsOverlay();
    await updateCampaignsStatus();
    await updateBunkerStatus(); // Refresh cash display

  } catch (error) {
    console.error('Error buying campaign:', error);
    showFeedback('Failed to activate campaign', 'error');
  }
}

async function testBrowserNotification() {
  const hasPermission = await requestNotificationPermission();

  if (!hasPermission) {
    showFeedback('Please enable notifications first!', 'error');
    return;
  }

  try {
    // Show browser notification using service worker
    await showNotification('🔔 Test Price Alert', {
      body: `Test Alert!\n\nFuel threshold: $${settings.fuelThreshold}/ton\nCO2 threshold: $${settings.co2Threshold}/ton`,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⚓</text></svg>",
      tag: 'test-alert',
      silent: false
    });

    // Show price alert on page with spin animation
    showPriceAlert(`⚠️ Test Alert<br><br>⛽ Fuel threshold: <strong>$${settings.fuelThreshold}/ton</strong><br>💨 CO2 threshold: <strong>$${settings.co2Threshold}/ton</strong>`, 'warning');
  } catch (error) {
    console.error('[Test Alert] Notification error:', error);
    console.error('[Test Alert] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      notificationPermission: Notification.permission,
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol
    });
    showPriceAlert(`❌ Failed to send notification<br><br><strong>Error:</strong> ${error.message}<br><br><strong>Permission:</strong> ${Notification.permission}<br><strong>Secure:</strong> ${window.isSecureContext ? 'Yes' : 'No'}<br><strong>Protocol:</strong> ${window.location.protocol}`, 'error');
  }
}

// Track if we already alerted for current prices
let lastFuelAlertPrice = null;
let lastCO2AlertPrice = null;

// Check prices and trigger alerts if below threshold
async function checkPriceAlerts() {
  try {
    console.log('[Price Alert] Checking prices...');
    const response = await fetch('/api/bunker/get-prices');
    if (!response.ok) {
      console.error('[Price Alert] API response not OK:', response.status);
      return;
    }

    const data = await response.json();
    console.log('[Price Alert] Got price data:', data);

    // Get current price based on UTC time (same logic as updateBunkerStatus)
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const currentTimeSlot = `${String(utcHours).padStart(2, '0')}:${utcMinutes < 30 ? '00' : '30'}`;

    const currentPriceData = data.data.prices.find(p => p.time === currentTimeSlot);

    if (!currentPriceData) return; // No price data available for current time

    const currentFuelPrice = currentPriceData.fuel_price;
    const currentCO2Price = currentPriceData.co2_price;

    const hasPermission = Notification.permission === "granted";
    console.log('[Price Alert] Current fuel:', currentFuelPrice, 'Threshold:', settings.fuelThreshold, 'Last alert:', lastFuelAlertPrice);
    console.log('[Price Alert] Current CO2:', currentCO2Price, 'Threshold:', settings.co2Threshold, 'Last alert:', lastCO2AlertPrice);

    if (currentFuelPrice <= settings.fuelThreshold && lastFuelAlertPrice !== currentFuelPrice) {
      lastFuelAlertPrice = currentFuelPrice;
      console.log('[Price Alert] FUEL ALERT TRIGGERED!', currentFuelPrice);

      if (hasPermission) {
        await showNotification('⛽ Fuel Price Alert!', {
          body: `Fuel price dropped to $${currentFuelPrice}/ton (Your threshold: $${settings.fuelThreshold}/ton)`,
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⛽</text></svg>",
          tag: 'fuel-alert',
          silent: false
        });
      }

      showPriceAlert(`⛽ Fuel Price Alert!<br><br>Current price: <strong>$${currentFuelPrice}/ton</strong><br>Your threshold: $${settings.fuelThreshold}/ton`, 'warning');
    }

    // Check CO2 price
    if (currentCO2Price <= settings.co2Threshold && lastCO2AlertPrice !== currentCO2Price) {
      lastCO2AlertPrice = currentCO2Price;
      console.log('[Price Alert] CO2 ALERT TRIGGERED!', currentCO2Price);

      if (hasPermission) {
        await showNotification('💨 CO2 Price Alert!', {
          body: `CO2 price dropped to $${currentCO2Price}/ton (Your threshold: $${settings.co2Threshold}/ton)`,
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>💨</text></svg>",
          tag: 'co2-alert',
          silent: false
        });
      }

      showPriceAlert(`💨 CO2 Price Alert!<br><br>Current price: <strong>$${currentCO2Price}/ton</strong><br>Your threshold: $${settings.co2Threshold}/ton`, 'warning');
    }

    if (currentFuelPrice > settings.fuelThreshold) {
      lastFuelAlertPrice = null;
    }
    if (currentCO2Price > settings.co2Threshold) {
      lastCO2AlertPrice = null;
    }
  } catch (error) {
    console.error('[Price Alert] ERROR checking price alerts:', error);
    console.error('[Price Alert] Error stack:', error.stack);
  }
}

// --- All Chats Overview ---

async function showAllChats() {
  try {
    const response = await fetch('/api/messenger/get-chats');
    if (!response.ok) throw new Error('Failed to get chats');

    const data = await response.json();
    const chats = data.chats.filter(chat => !chat.system_chat);

    // Sort by last message time (newest first)
    const sortedChats = chats.sort((a, b) => (b.time_last_message || 0) - (a.time_last_message || 0));

    const listContainer = document.getElementById('allChatsList');

    if (sortedChats.length === 0) {
      listContainer.innerHTML = '<div class="empty-message">No private conversations yet.</div>';
    } else {
      listContainer.innerHTML = sortedChats.map((chat, index) => {
        const lastMsg = chat.last_message ? escapeHtml(chat.last_message.substring(0, 60)) + '...' : 'No messages';
        const subject = chat.subject || 'No subject';
        const participant = chat.participants_string || 'Unknown';
        const unreadIndicator = chat.new ? '<span class="unread-indicator"></span>' : '';

        return `
          <div class="chat-selection-item" data-chat-index="${index}">
            <h3>${escapeHtml(participant)} - ${escapeHtml(subject)}${unreadIndicator}</h3>
            <p>${lastMsg}</p>
          </div>
        `;
      }).join('');

      // Add click handlers
      listContainer.querySelectorAll('.chat-selection-item').forEach(item => {
        item.addEventListener('click', () => {
          const chatIndex = parseInt(item.dataset.chatIndex);
          const selectedChat = sortedChats[chatIndex];

          // Extract user ID from participants (assuming 2 participants: own user and other user)
          const targetUserId = selectedChat.participant_ids?.find(id => id !== data.own_user_id);
          const targetCompanyName = selectedChat.participants_string;

          document.getElementById('allChatsOverlay').style.display = 'none';
          openExistingChat(targetCompanyName, targetUserId, selectedChat, data.own_user_id);
        });
      });
    }

    document.getElementById('allChatsOverlay').style.display = 'flex';

  } catch (error) {
    console.error('Error loading all chats:', error);
    alert(`Error: ${error.message}`);
  }
}

function closeAllChats() {
  document.getElementById('allChatsOverlay').style.display = 'none';
}

// Debounced unread badge update
function debouncedUpdateUnreadBadge(delay = 1000) {
  clearTimeout(updateUnreadTimeout);
  updateUnreadTimeout = setTimeout(() => updateUnreadBadge(), delay);
}

async function updateUnreadBadge() {
  try {
    const response = await fetch('/api/messenger/get-chats');
    if (!response.ok) return;

    const data = await response.json();
    const unreadCount = data.chats.filter(chat => !chat.system_chat && chat.new).length;

    const badge = document.getElementById('unreadBadge');
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking unread messages:', error);
  }
}

// --- Bunker Management ---

let maxFuel = 5750; // 5,750 tons
let maxCO2 = 55000; // 55,000 tons
let currentFuel = 0;
let currentCO2 = 0;
let currentCash = 0;
let fuelPrice = 0;
let co2Price = 0;

// Old threshold constants - now using settings object instead
// (Alert tracking variables moved to top of file near settings)

// Debounced bunker status update
function debouncedUpdateBunkerStatus(delay = 800) {
  clearTimeout(updateBunkerTimeout);
  updateBunkerTimeout = setTimeout(() => updateBunkerStatus(), delay);
}

async function updateBunkerStatus() {
  try {
    const response = await fetch('/api/bunker/get-prices');
    if (!response.ok) return;

    const data = await response.json();

    // Update current values from user data - API returns values in kg, convert to tons
    currentFuel = (data.user.fuel || 0) / 1000;
    currentCO2 = (data.user.co2 || 0) / 1000; // CO2 can be negative (deficit)
    currentCash = data.user.cash || 0;

    // Get current price based on UTC time
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const currentTimeSlot = `${String(utcHours).padStart(2, '0')}:${utcMinutes < 30 ? '00' : '30'}`;

    const currentPriceData = data.data.prices.find(p => p.time === currentTimeSlot);

    if (currentPriceData) {
      fuelPrice = currentPriceData.fuel_price;
      co2Price = currentPriceData.co2_price;
    }

    // Update displays
    const fuelDisplay = document.getElementById('fuelDisplay');
    const co2Display = document.getElementById('co2Display');
    const cashDisplay = document.getElementById('cashDisplay');
    const fuelPriceDisplay = document.getElementById('fuelPriceDisplay');
    const co2PriceDisplay = document.getElementById('co2PriceDisplay');

    fuelDisplay.textContent = `${formatNumber(currentFuel)}t/${formatNumber(maxFuel)}t`;

    // CO2 display: show absolute value with minus sign if negative
    if (currentCO2 < 0) {
      co2Display.textContent = `-${formatNumber(Math.abs(currentCO2))}t/${formatNumber(maxCO2)}t`;
    } else {
      co2Display.textContent = `${formatNumber(currentCO2)}t/${formatNumber(maxCO2)}t`;
    }

    // Cash display
    cashDisplay.textContent = `$${formatNumber(currentCash)}`;

    // Price displays with color coding (using settings thresholds)
    if (fuelPrice <= settings.fuelThreshold) {
      fuelPriceDisplay.textContent = `$${formatNumber(fuelPrice)}/t`;
      fuelPriceDisplay.style.color = '#4ade80'; // Green
      fuelPriceDisplay.style.fontWeight = '700';
    } else {
      fuelPriceDisplay.textContent = `$${formatNumber(fuelPrice)}/t`;
      fuelPriceDisplay.style.color = '#9ca3af'; // Normal gray
      fuelPriceDisplay.style.fontWeight = '500';
    }

    if (co2Price <= settings.co2Threshold) {
      co2PriceDisplay.textContent = `$${formatNumber(co2Price)}/t`;
      co2PriceDisplay.style.color = '#4ade80'; // Green
      co2PriceDisplay.style.fontWeight = '700';
    } else {
      co2PriceDisplay.textContent = `$${formatNumber(co2Price)}/t`;
      co2PriceDisplay.style.color = '#9ca3af'; // Normal gray
      co2PriceDisplay.style.fontWeight = '500';
    }

    // Update button tooltips with price info
    const fuelNeeded = Math.max(0, maxFuel - currentFuel);
    const co2Needed = Math.max(0, maxCO2 - currentCO2);
    const fuelCost = fuelNeeded * fuelPrice;
    const co2Cost = co2Needed * co2Price;

    document.getElementById('fuelBtn').title = `Buy ${formatNumber(fuelNeeded)}t fuel for $${formatNumber(fuelCost)} (Price: $${fuelPrice}/t)`;
    document.getElementById('co2Btn').title = `Buy ${formatNumber(co2Needed)}t CO2 for $${formatNumber(co2Cost)} (Price: $${co2Price}/t)`;

  } catch (error) {
    console.error('Error updating bunker status:', error);
  }
}

async function updateCampaignsStatus() {
  try {
    const response = await fetch('/api/marketing/get-campaigns');
    if (!response.ok) return;

    const data = await response.json();

    // Determine which campaign types are active
    const activeCampaigns = data.data.active_campaigns || [];
    const activeTypes = new Set(activeCampaigns.map(c => c.option_name));

    // Count active campaign types (reputation, awareness, green)
    const requiredTypes = ['reputation', 'awareness', 'green'];
    const activeCount = requiredTypes.filter(type => activeTypes.has(type)).length;

    // Update badge
    const badge = document.getElementById('campaignsCount');
    const button = document.getElementById('campaignsBtn');

    if (activeCount === 3) {
      // All active - hide badge
      badge.style.display = 'none';
    } else {
      // Show red badge with count
      badge.textContent = activeCount;
      badge.style.display = 'block';
      badge.style.background = '#ef4444'; // Red
    }

    // Build tooltip text
    const statusList = requiredTypes.map(type => {
      const isActive = activeTypes.has(type);
      const icon = isActive ? '✓' : '✗';
      const name = type.charAt(0).toUpperCase() + type.slice(1);
      return `${icon} ${name}`;
    }).join('\n');

    button.title = `Marketing Campaigns (${activeCount}/3 active)\n${statusList}`;

    // Check if count changed or initial load
    if (lastCampaignsCount === null) {
      // First load - only notify if not all 3 active
      if (activeCount !== 3) {
        showPriceAlert(`⚠️ Only ${activeCount}/3 marketing campaigns are active!`, 'warning');

        // Browser notification
        if (Notification.permission === 'granted') {
          await showNotification('Marketing Campaigns Alert', {
            body: `Only ${activeCount}/3 campaign types are active`,
            icon: '/favicon.ico'
          });
        }
      }
    } else if (lastCampaignsCount !== activeCount) {
      // Count changed - always notify
      if (activeCount === 3) {
        showFeedback('✅ All 3 marketing campaigns are now active!', 'success');
      } else {
        showPriceAlert(`⚠️ Marketing campaigns changed: ${activeCount}/3 active`, 'warning');

        // Browser notification
        if (Notification.permission === 'granted') {
          await showNotification('Marketing Campaigns Alert', {
            body: `Campaign count changed: ${activeCount}/3 types are active`,
            icon: '/favicon.ico'
          });
        }
      }
    }

    lastCampaignsCount = activeCount;

  } catch (error) {
    console.error('Error updating campaigns status:', error);
  }
}

function formatNumber(num) {
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

async function buyMaxFuel() {
  const fuelNeeded = Math.max(0, maxFuel - currentFuel);

  if (fuelNeeded === 0) {
    showFeedback('Fuel tank is already full!', 'error');
    return;
  }

  const totalCost = fuelNeeded * fuelPrice;

  const confirmed = await showConfirmDialog({
    title: '⛽ Purchase Fuel',
    message: 'Do you want to purchase fuel to fill your tank?',
    confirmText: 'Buy Fuel',
    details: [
      { label: 'Amount needed', value: `${formatNumber(fuelNeeded)}t` },
      { label: 'Price per ton', value: `$${formatNumber(fuelPrice)}/t` },
      { label: 'Total Cost', value: `$${formatNumber(totalCost)}` }
    ]
  });

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch('/api/bunker/purchase-fuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(fuelNeeded * 1000) }) // Convert tons to kg for API
    });

    const data = await response.json();

    if (data.error) {
      showFeedback(`Error: ${data.error}`, 'error');
    } else {
      showFeedback(`Purchased ${formatNumber(fuelNeeded)}t fuel for $${formatNumber(totalCost)}!`, 'success');
      debouncedUpdateBunkerStatus(500);
    }
  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
  }
}

async function buyMaxCO2() {
  const co2Needed = Math.max(0, maxCO2 - currentCO2);

  if (co2Needed === 0) {
    showFeedback('CO2 storage is already full!', 'error');
    return;
  }

  const totalCost = co2Needed * co2Price;

  const confirmed = await showConfirmDialog({
    title: '💨 Purchase CO2 Quota',
    message: 'Do you want to purchase CO2 quota to fill your storage?',
    confirmText: 'Buy CO2',
    details: [
      { label: 'Amount needed', value: `${formatNumber(co2Needed)}t` },
      { label: 'Price per ton', value: `$${formatNumber(co2Price)}/t` },
      { label: 'Total Cost', value: `$${formatNumber(totalCost)}` }
    ]
  });

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch('/api/bunker/purchase-co2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(co2Needed * 1000) }) // Convert tons to kg for API
    });

    const data = await response.json();

    if (data.error) {
      showFeedback(`Error: ${data.error}`, 'error');
    } else {
      showFeedback(`Purchased ${formatNumber(co2Needed)}t CO2 for $${formatNumber(totalCost)}!`, 'success');
      debouncedUpdateBunkerStatus(500);
    }
  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
  }
}

// --- Vessel Management ---

// Debounced vessel count update
function debouncedUpdateVesselCount(delay = 800) {
  clearTimeout(updateVesselTimeout);
  updateVesselTimeout = setTimeout(() => updateVesselCount(), delay);
}

async function updateVesselCount() {
  try {
    const response = await fetch('/api/vessel/get-vessels');
    if (!response.ok) return;

    const data = await response.json();
    const vessels = data.vessels || [];

    // Count vessels in harbor (route_end_time is null or in the past)
    const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
    const vesselsInHarbor = vessels.filter(v => {
      return !v.route_end_time || parseInt(v.route_end_time) < now;
    }).length;

    const countBadge = document.getElementById('vesselCount');
    const departBtn = document.getElementById('departAllBtn');

    if (vesselsInHarbor > 0) {
      countBadge.textContent = vesselsInHarbor;
      countBadge.style.display = 'block';
      departBtn.disabled = false;
      departBtn.title = `Depart all ${vesselsInHarbor} vessel${vesselsInHarbor === 1 ? '' : 's'} from harbor`;
    } else {
      countBadge.style.display = 'none';
      departBtn.disabled = true;
      departBtn.title = 'No vessels in harbor';
    }
  } catch (error) {
    console.error('Error updating vessel count:', error);
  }
}

async function departAllVessels() {
  const departBtn = document.getElementById('departAllBtn');
  const vesselCountBadge = document.getElementById('vesselCount');
  const vesselsInHarbor = parseInt(vesselCountBadge.textContent) || 0;

  departBtn.disabled = true;

  try {
    const response = await fetch('/api/route/depart-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to depart vessels');
    }

    const data = await response.json();

    // Check if API returned an error
    if (data.error) {
      showFeedback(`Error: ${data.error}`, 'error');
      departBtn.disabled = false;
      return;
    }

    // Get how many vessels actually departed from API response
    const vesselsDeparted = data.data?.depart_info?.vessel_count || 0;
    const fuelUsed = (data.data?.depart_info?.fuel_usage || 0) / 1000; // Convert to tons
    const co2Emitted = (data.data?.depart_info?.co2_emission || 0) / 1000; // Convert to tons
    const departIncome = data.data?.depart_info?.depart_income || 0;
    const harborFee = data.data?.depart_info?.harbor_fee || 0;

    // Update cash display immediately (optimistic update)
    const netIncome = departIncome - harborFee;
    currentCash += netIncome;
    currentFuel -= fuelUsed;
    currentCO2 -= co2Emitted;

    document.getElementById('cashDisplay').textContent = `$${formatNumber(currentCash)}`;
    document.getElementById('fuelDisplay').textContent = `${formatNumber(currentFuel)}t/${formatNumber(maxFuel)}t`;
    if (currentCO2 < 0) {
      document.getElementById('co2Display').textContent = `-${formatNumber(Math.abs(currentCO2))}t/${formatNumber(maxCO2)}t`;
    } else {
      document.getElementById('co2Display').textContent = `${formatNumber(currentCO2)}t/${formatNumber(maxCO2)}t`;
    }

    // Update vessel count and refresh from server to ensure accuracy
    // Spread out the API calls for stealth
    setTimeout(() => debouncedUpdateVesselCount(800), 1000);
    setTimeout(() => debouncedUpdateBunkerStatus(800), 1200);

    // Show appropriate feedback based on results
    if (vesselsDeparted === 0) {
      showPriceAlert('🚢 No vessels could depart! Check fuel availability.', 'error');
    } else if (vesselsDeparted < vesselsInHarbor) {
      // Only some vessels departed - not enough fuel
      const vesselsRemaining = vesselsInHarbor - vesselsDeparted;
      showPriceAlert(`<strong>🚢 Only ${vesselsDeparted} of ${vesselsInHarbor} vessels departed!</strong><br><br>${vesselsRemaining} vessels remaining in harbor<br>⛽ Fuel used: ${formatNumber(fuelUsed)}t<br>💨 CO2 emitted: ${formatNumber(co2Emitted)}t<br>💰 Net income: $${formatNumber(netIncome)}<br><span style="opacity: 0.7; font-size: 0.9em;">(Income: $${formatNumber(departIncome)} - Fee: $${formatNumber(harborFee)})</span>`, 'error');
    } else {
      // All vessels departed successfully
      showPriceAlert(`<strong>🚢 All ${vesselsDeparted} vessel${vesselsDeparted === 1 ? '' : 's'} departed!</strong><br><br>⛽ Fuel used: ${formatNumber(fuelUsed)}t<br>💨 CO2 emitted: ${formatNumber(co2Emitted)}t<br>💰 Net income: $${formatNumber(netIncome)}<br><span style="opacity: 0.7; font-size: 0.9em;">(Income: $${formatNumber(departIncome)} - Fee: $${formatNumber(harborFee)})</span>`, 'success');
    }

  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
    departBtn.disabled = false;
  }
}

// --- Vessel Maintenance Functions ---

let updateRepairTimeout = null;

// Debounced repair count update
function debouncedUpdateRepairCount(delay = 800) {
  clearTimeout(updateRepairTimeout);
  updateRepairTimeout = setTimeout(() => updateRepairCount(), delay);
}

async function updateRepairCount() {
  try {
    const response = await fetch('/api/vessel/get-vessels');
    if (!response.ok) return;

    const data = await response.json();
    const vessels = data.vessels || [];

    // Filter vessels that need repair (wear >= maintenance threshold)
    const vesselsNeedingRepair = vessels.filter(v => {
      const wear = parseInt(v.wear) || 0;
      return wear >= settings.maintenanceThreshold;
    });

    const countBadge = document.getElementById('repairCount');
    const repairBtn = document.getElementById('repairAllBtn');

    if (vesselsNeedingRepair.length > 0) {
      countBadge.textContent = vesselsNeedingRepair.length;
      countBadge.style.display = 'block';
      repairBtn.disabled = false;
      repairBtn.title = `Repair ${vesselsNeedingRepair.length} vessel${vesselsNeedingRepair.length === 1 ? '' : 's'} with ${settings.maintenanceThreshold}%+ wear`;
    } else {
      countBadge.style.display = 'none';
      repairBtn.disabled = true;
      repairBtn.title = `No vessels with ${settings.maintenanceThreshold}%+ wear`;
    }
  } catch (error) {
    console.error('Error updating repair count:', error);
  }
}

async function repairAllVessels() {
  const repairBtn = document.getElementById('repairAllBtn');
  const repairCountBadge = document.getElementById('repairCount');
  const vesselsNeedingRepair = parseInt(repairCountBadge.textContent) || 0;

  if (vesselsNeedingRepair === 0) return;

  // Get all vessels and filter by wear threshold
  try {
    const response = await fetch('/api/vessel/get-vessels');
    if (!response.ok) throw new Error('Failed to get vessels');

    const data = await response.json();
    const vessels = data.vessels || [];

    const vesselsToRepair = vessels.filter(v => {
      const wear = parseInt(v.wear) || 0;
      return wear >= settings.maintenanceThreshold;
    });

    if (vesselsToRepair.length === 0) {
      showFeedback('No vessels need repair!', 'error');
      return;
    }

    // Get repair cost estimate
    const vesselIds = vesselsToRepair.map(v => v.id);

    const costResponse = await fetch('/api/maintenance/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_ids: JSON.stringify(vesselIds) })
    });

    if (!costResponse.ok) throw new Error('Failed to get repair cost');

    const costData = await costResponse.json();

    // Calculate total cost by summing up all "wear" maintenance prices
    let totalCost = 0;
    if (costData.data?.vessels) {
      costData.data.vessels.forEach(vessel => {
        const wearMaintenance = vessel.maintenance_data?.find(m => m.type === 'wear');
        if (wearMaintenance) {
          totalCost += wearMaintenance.price || 0;
        }
      });
    }

    // Check if user has enough cash
    if (totalCost > currentCash) {
      showFeedback(`<strong>Not enough cash!</strong><br><br>Repair cost: $${formatNumber(totalCost)}<br>Your cash: $${formatNumber(currentCash)}<br>Missing: $${formatNumber(totalCost - currentCash)}`, 'error');
      return;
    }

    // Show confirmation dialog
    const confirmed = await showConfirmDialog({
      title: '🔧 Bulk Vessel Repair',
      message: `Do you want to repair all vessels with ${settings.maintenanceThreshold}%+ wear?`,
      confirmText: 'Repair All',
      details: [
        { label: 'Vessels to repair', value: `${vesselsToRepair.length}` },
        { label: 'Wear threshold', value: `${settings.maintenanceThreshold}%` },
        { label: 'Total Cost', value: `$${formatNumber(totalCost)}` }
      ]
    });

    if (!confirmed) return;

    repairBtn.disabled = true;

    // Perform bulk repair
    const repairResponse = await fetch('/api/maintenance/do-wear-maintenance-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_ids: JSON.stringify(vesselIds) })
    });

    if (!repairResponse.ok) throw new Error('Failed to repair vessels');

    const repairData = await repairResponse.json();

    if (repairData.error) {
      showFeedback(`Error: ${repairData.error}`, 'error');
      repairBtn.disabled = false;
      return;
    }

    // Show success feedback
    showFeedback(`<strong>${vesselsToRepair.length} vessels repaired!</strong><br><br>💰 Total cost: $${formatNumber(totalCost)}<br>🔧 Wear threshold: ${settings.maintenanceThreshold}%`, 'success');

    // Update repair count and bunker status
    setTimeout(() => debouncedUpdateRepairCount(800), 1000);
    setTimeout(() => debouncedUpdateBunkerStatus(800), 1200);

  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
    repairBtn.disabled = false;
  }
}

async function sendPrivateMessage() {
  const messageInput = document.getElementById('messengerInput');
  const subjectInput = document.getElementById('subjectInput');
  const sendBtn = document.getElementById('sendPrivateMessageBtn');
  const message = messageInput.value.trim();

  if (!message || message.length > 1000) {
    alert('Invalid message length.');
    return;
  }

  let subject;
  if (currentPrivateChat.isNewChat) {
    // New chat - subject must be provided
    subject = subjectInput.value.trim();
    if (!subject || subject.length === 0) {
      alert('Please enter a subject.');
      subjectInput.focus();
      return;
    }
  } else {
    // Existing chat - use stored subject
    subject = currentPrivateChat.subject;
  }

  sendBtn.disabled = true;
  messageInput.disabled = true;

  try {
    const response = await fetch('/api/messenger/send-private', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_id: currentPrivateChat.targetUserId,
        subject: subject,
        message: message
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Update unread badge and close/reopen messenger
    debouncedUpdateUnreadBadge();
    closeMessenger();
    setTimeout(() => {
      openMessenger(currentPrivateChat.targetCompanyName, currentPrivateChat.targetUserId);
    }, 500);

  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    sendBtn.disabled = false;
    messageInput.disabled = false;
  }
}

// --- Notification Functions ---

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

async function showChatNotification(title, message) {
  if (Notification.permission === "granted" && document.hidden) {
    await showNotification(title, {
      body: message,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⚓</text></svg>",
      tag: "shipping-manager-chat",
      silent: false,
      data: { action: 'focus-chat' }
    });
  }
}

function handleNotifications(newMessages) {
  if (document.hidden) {
    newMessages.forEach(msg => {
      if (msg.type === 'chat') {
        showChatNotification(
          `💬 ${msg.company}`,
          msg.message.substring(0, 100) + (msg.message.length > 100 ? '...' : '')
        );
      } else if (msg.type === 'feed') {
        showChatNotification(
          '📢 Alliance Event',
          `${msg.feedType}: ${msg.company}`
        );
      }
    });
  }
}

// --- Custom Tooltip System ---
function initCustomTooltips() {
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  document.body.appendChild(tooltip);

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[title]');
    if (target && target.hasAttribute('title')) {
      const title = target.getAttribute('title');
      if (!title) return;

      // Remove title temporarily to prevent browser tooltip
      target.setAttribute('data-title', title);
      target.removeAttribute('title');

      tooltip.textContent = title;
      tooltip.classList.add('show');

      const moveTooltip = (event) => {
        const x = event.clientX;
        const y = event.clientY;
        const tooltipRect = tooltip.getBoundingClientRect();

        // Calculate position with viewport boundaries
        let left = x + 10;
        let top = y + 10;

        // Keep within right edge
        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 10;
        }

        // Keep within bottom edge
        if (top + tooltipRect.height > window.innerHeight) {
          top = y - tooltipRect.height - 10;
        }

        // Keep within left edge
        if (left < 10) {
          left = 10;
        }

        // Keep within top edge
        if (top < 10) {
          top = 10;
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      };

      moveTooltip(e);
      target.addEventListener('mousemove', moveTooltip);

      const hideTooltip = () => {
        tooltip.classList.remove('show');
        target.removeEventListener('mousemove', moveTooltip);
        target.removeEventListener('mouseout', hideTooltip);

        // Restore original title
        if (target.hasAttribute('data-title')) {
          target.setAttribute('title', target.getAttribute('data-title'));
          target.removeAttribute('data-title');
        }
      };

      target.addEventListener('mouseout', hideTooltip);
    }
  });
}

// --- Service Worker Registration ---
let swRegistration = null;

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('[Service Worker] Registered successfully:', swRegistration);

      // Wait for service worker to become active
      if (swRegistration.installing) {
        console.log('[Service Worker] Waiting for activation...');
        await new Promise((resolve) => {
          swRegistration.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              console.log('[Service Worker] Activated!');
              resolve();
            }
          });
        });
      } else if (swRegistration.waiting) {
        console.log('[Service Worker] Waiting worker found, activating...');
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else if (swRegistration.active) {
        console.log('[Service Worker] Already active');
      }

      return swRegistration;
    } catch (error) {
      console.error('[Service Worker] Registration failed:', error);
      return null;
    }
  }
  return null;
}

// Helper function to show notifications (works on both desktop and mobile)
async function showNotification(title, options) {
  if (Notification.permission !== 'granted') {
    return false;
  }

  // Enhance options for mobile devices
  const enhancedOptions = {
    ...options,
    vibrate: [200, 100, 200], // Vibration pattern for Android
    requireInteraction: false, // Don't force user interaction (auto-close after timeout)
    badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⚓</text></svg>"
  };

  try {
    // Try direct notification first (works best on desktop)
    try {
      const notification = new Notification(title, enhancedOptions);
      notification.onclick = function() {
        window.focus();
        notification.close();
      };
      if (options.autoClose !== false) {
        setTimeout(() => notification.close(), 5000);
      }
      return true;
    } catch (directError) {
      // Direct notification failed (mobile Chrome), try service worker
      if (swRegistration && swRegistration.active) {
        await swRegistration.showNotification(title, enhancedOptions);
        return true;
      } else {
        throw new Error('Service Worker not ready. Please reload the page.');
      }
    }
  } catch (error) {
    // Show error on screen instead of console
    showPriceAlert(`❌ Notification Error<br><br>${error.message}`, 'error');
    throw error;
  }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker first (for mobile notifications)
  await registerServiceWorker();

  // Initialize custom tooltips
  initCustomTooltips();
  // Alliance chat event listeners
  sendMessageBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('input', handleMessageInput);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && 
        (!document.getElementById('memberSuggestions') || document.getElementById('memberSuggestions').style.display !== 'block')) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatFeed.addEventListener('scroll', () => {
    autoScroll = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight < 50;
  });

  // Messenger event listeners
  document.getElementById('closeMessengerBtn').addEventListener('click', closeMessenger);
  document.getElementById('backToSelectionBtn').addEventListener('click', () => {
    const targetCompanyName = currentPrivateChat.targetCompanyName;
    const targetUserId = currentPrivateChat.targetUserId;
    closeMessenger();
    openMessenger(targetCompanyName, targetUserId);
  });
  document.getElementById('sendPrivateMessageBtn').addEventListener('click', sendPrivateMessage);
  document.getElementById('messengerInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrivateMessage();
    }
  });

  // Chat selection event listeners
  document.getElementById('closeChatSelectionBtn').addEventListener('click', closeChatSelection);

  // All chats overview
  document.getElementById('allChatsBtn').addEventListener('click', showAllChats);
  document.getElementById('closeAllChatsBtn').addEventListener('click', closeAllChats);

  // Contact list
  document.getElementById('contactListBtn').addEventListener('click', showContactList);
  document.getElementById('closeContactListBtn').addEventListener('click', closeContactList);

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', showSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
  document.getElementById('campaignsBtn').addEventListener('click', showCampaignsOverlay);
  document.getElementById('closeCampaignsBtn').addEventListener('click', closeCampaignsOverlay);
  document.getElementById('testAlertBtn').addEventListener('click', testBrowserNotification);
  document.getElementById('fuelThreshold').addEventListener('change', function() {
    settings.fuelThreshold = parseInt(this.value);
    saveSettings();
  });
  document.getElementById('co2Threshold').addEventListener('change', function() {
    settings.co2Threshold = parseInt(this.value);
    saveSettings();
  });
  document.getElementById('maintenanceThreshold').addEventListener('change', function() {
    settings.maintenanceThreshold = parseInt(this.value);
    saveSettings();
    // Update repair count with new threshold
    debouncedUpdateRepairCount(500);
  });

  // Vessel management
  document.getElementById('departAllBtn').addEventListener('click', departAllVessels);
  document.getElementById('repairAllBtn').addEventListener('click', repairAllVessels);

  // Bunker management
  document.getElementById('fuelBtn').addEventListener('click', buyMaxFuel);
  document.getElementById('co2Btn').addEventListener('click', buyMaxCO2);

  // Messenger input height adjustment
  document.getElementById('messengerInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Initialize notifications
  const notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', async () => {
      const hasPermission = await requestNotificationPermission();
      if (hasPermission) {
        notificationBtn.style.display = 'none';
        showFeedback('Notifications enabled!', 'success');
      }
    });
    if (Notification.permission === "granted") {
      notificationBtn.style.display = 'none';
    }
  }

  // Load settings from localStorage
  loadSettings();

  // Auto-request notification permission on load (if not already decided)
  if ("Notification" in window && Notification.permission === "default") {
    await requestNotificationPermission();
  }

  // Initial load - with delays to prevent socket hang up
  await fetchAllianceMembers();
  await new Promise(resolve => setTimeout(resolve, 500));

  await loadMessages();
  await new Promise(resolve => setTimeout(resolve, 500));

  await updateUnreadBadge();
  await new Promise(resolve => setTimeout(resolve, 500));

  await updateVesselCount();
  await new Promise(resolve => setTimeout(resolve, 500));

  await updateRepairCount();
  await new Promise(resolve => setTimeout(resolve, 500));

  await updateBunkerStatus();
  await new Promise(resolve => setTimeout(resolve, 500));

  await updateCampaignsStatus();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check price alerts on load
  await checkPriceAlerts();

  // WebSocket initialization (use wss:// for HTTPS)
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      if (type === 'chat_update' || type === 'message_sent') {
        loadMessages();
      }
    };
  } catch (e) {
    // WebSocket not available
  }

  // Auto-refresh with randomized intervals for stealth
  setInterval(loadMessages, 25000 + Math.random() * 2000); // 25-27s

  setInterval(updateUnreadBadge, 30000 + Math.random() * 5000); // 30-35s

  // Check price alerts every 30 seconds
  setInterval(checkPriceAlerts, 30000); // 30s

  setInterval(updateVesselCount, 60000 + Math.random() * 10000); // 60-70s

  setInterval(updateRepairCount, 60000 + Math.random() * 10000); // 60-70s

  setInterval(updateBunkerStatus, 30000 + Math.random() * 5000); // 30-35s

  setInterval(updateCampaignsStatus, 60000 + Math.random() * 10000); // 60-70s
});