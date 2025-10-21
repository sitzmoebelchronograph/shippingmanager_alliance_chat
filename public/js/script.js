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
  globalFeedback.innerHTML = `<div class="global-feedback-message ${type}">${message}</div>`;
  globalFeedback.classList.add('show');

  setTimeout(() => {
    globalFeedback.classList.remove('show');
    setTimeout(() => {
      globalFeedback.innerHTML = '';
    }, 300);
  }, 6000);
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

// Price alert tracking
let lastFuelAlertPrice = null;
let lastCO2AlertPrice = null;
const FUEL_ALERT_THRESHOLD = 400;
const CO2_ALERT_THRESHOLD = 7;

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

    // Price displays with color coding
    if (fuelPrice <= FUEL_ALERT_THRESHOLD) {
      fuelPriceDisplay.textContent = `$${formatNumber(fuelPrice)}/t`;
      fuelPriceDisplay.style.color = '#4ade80'; // Green
      fuelPriceDisplay.style.fontWeight = '700';
    } else {
      fuelPriceDisplay.textContent = `$${formatNumber(fuelPrice)}/t`;
      fuelPriceDisplay.style.color = '#9ca3af'; // Normal gray
      fuelPriceDisplay.style.fontWeight = '500';
    }

    if (co2Price <= CO2_ALERT_THRESHOLD) {
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

    // Check for price alerts
    checkPriceAlerts();

  } catch (error) {
    console.error('Error updating bunker status:', error);
  }
}

function checkPriceAlerts() {
  // Check fuel price alert
  if (fuelPrice <= FUEL_ALERT_THRESHOLD) {
    // Show alert if this is the first time or if price dropped further
    if (lastFuelAlertPrice === null || fuelPrice < lastFuelAlertPrice) {
      lastFuelAlertPrice = fuelPrice;
      showPriceAlert('⛽ Low Fuel Price Alert!', `Fuel price is now $${fuelPrice}/t - Great time to buy!`);
      showNotification('⛽ Low Fuel Price Alert!', `Fuel price dropped to $${fuelPrice}/t`);
    }
  } else {
    lastFuelAlertPrice = null; // Reset when price goes above threshold
  }

  // Check CO2 price alert
  if (co2Price <= CO2_ALERT_THRESHOLD) {
    // Show alert if this is the first time or if price dropped further
    if (lastCO2AlertPrice === null || co2Price < lastCO2AlertPrice) {
      lastCO2AlertPrice = co2Price;
      showPriceAlert('💨 Low CO2 Price Alert!', `CO2 price is now $${co2Price}/t - Great time to buy!`);
      showNotification('💨 Low CO2 Price Alert!', `CO2 price dropped to $${co2Price}/t`);
    }
  } else {
    lastCO2AlertPrice = null; // Reset when price goes above threshold
  }
}

function showPriceAlert(title, message) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  overlay.style.zIndex = '5000';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.style.animation = 'slideDown 0.3s ease-out';

  dialog.innerHTML = `
    <div class="confirm-dialog-header" style="background: #065f46; border-bottom: 2px solid #4ade80;">
      <h3 style="color: #86efac;">${escapeHtml(title)}</h3>
    </div>
    <div class="confirm-dialog-body">
      <p style="font-size: 16px; color: #d1d5db;">${escapeHtml(message)}</p>
    </div>
    <div class="confirm-dialog-footer">
      <button class="confirm-dialog-btn confirm" data-action="close">Got it!</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const handleClick = (e) => {
    if (e.target.dataset.action === 'close' || e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };

  overlay.addEventListener('click', handleClick);
  dialog.addEventListener('click', handleClick);

  // Auto-close after 10 seconds
  setTimeout(() => {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }, 10000);
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
      showFeedback('No vessels could depart! Check fuel availability.', 'error');
    } else if (vesselsDeparted < vesselsInHarbor) {
      // Only some vessels departed - not enough fuel
      const vesselsRemaining = vesselsInHarbor - vesselsDeparted;
      showFeedback(`Only ${vesselsDeparted} of ${vesselsInHarbor} vessels departed! ${vesselsRemaining} remaining. ⛽ ${formatNumber(fuelUsed)}t fuel | 💨 ${formatNumber(co2Emitted)}t CO2 | 💰 $${formatNumber(netIncome)} earned (Income: $${formatNumber(departIncome)} - Fee: $${formatNumber(harborFee)})`, 'error');
    } else {
      // All vessels departed successfully
      showFeedback(`All ${vesselsDeparted} vessels departed! ⛽ ${formatNumber(fuelUsed)}t fuel | 💨 ${formatNumber(co2Emitted)}t CO2 | 💰 $${formatNumber(netIncome)} earned (Income: $${formatNumber(departIncome)} - Fee: $${formatNumber(harborFee)})`, 'success');
    }

  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
    departBtn.disabled = false;
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

function showNotification(title, message) {
  if (Notification.permission === "granted" && document.hidden) {
    const notification = new Notification(title, {
      body: message,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' x='50%' text-anchor='middle' font-size='80'>⚓</text></svg>",
      tag: "shipping-manager-chat",
      silent: false
    });

    notification.onclick = function() {
      window.focus();
      notification.close();
      chatFeed.scrollTop = chatFeed.scrollHeight;
    };
    setTimeout(() => notification.close(), 5000);
  }
}

function handleNotifications(newMessages) {
  if (document.hidden) {
    newMessages.forEach(msg => {
      if (msg.type === 'chat') {
        showNotification(
          `💬 ${msg.company}`,
          msg.message.substring(0, 100) + (msg.message.length > 100 ? '...' : '')
        );
      } else if (msg.type === 'feed') {
        showNotification(
          '📢 Alliance Event',
          `${msg.feedType}: ${msg.company}`
        );
      }
    });
  }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
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

  // Vessel management
  document.getElementById('departAllBtn').addEventListener('click', departAllVessels);

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

  // Initial load
  await fetchAllianceMembers();
  await loadMessages();
  await updateUnreadBadge();
  await updateVesselCount();
  await updateBunkerStatus();

  // WebSocket initialization
  try {
    const ws = new WebSocket(`ws://${window.location.host}`);
    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      if (type === 'chat_update' || type === 'message_sent') {
        loadMessages();
      }
    };
  } catch (e) {
    console.log('WebSocket not available');
  }

  // Auto-refresh with randomized intervals for stealth
  setInterval(loadMessages, 25000 + Math.random() * 2000); // 25-27s

  setInterval(updateUnreadBadge, 30000 + Math.random() * 5000); // 30-35s

  setInterval(updateVesselCount, 60000 + Math.random() * 10000); // 60-70s

  setInterval(updateBunkerStatus, 30000 + Math.random() * 5000); // 30-35s
});