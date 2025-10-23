/**
 * @fileoverview Private Messaging Module - Handles direct message conversations between players and system notifications.
 * Provides a WhatsApp-style messaging interface with conversation selection, message threading, and system message handling.
 *
 * Key Features:
 * - Multi-conversation management with subject-based threading
 * - System notification handling (vessel hijacking, stock transactions, alliance events)
 * - Chat selection overlay for choosing between multiple conversations with same user
 * - Message bubble UI with sender identification
 * - Unread badge tracking
 * - Chat deletion with confirmation
 * - Integration with contact list and alliance chat
 *
 * Conversation Flow:
 * 1. User clicks company name (from chat/contacts)
 * 2. System fetches all conversations with that user
 * 3. Conversation selection overlay displays (or creates new chat)
 * 4. Selected conversation opens with full message history
 * 5. User can send replies or delete conversation
 *
 * System Messages:
 * - Read-only notifications from game (vessel hijacked, stock trades, etc.)
 * - Formatted with specialized templates per message type
 * - Grouped under "Gameplay" participant
 * - Cannot reply (input hidden for system chats)
 *
 * @module messenger
 * @requires utils - HTML escaping functions
 * @requires api - Messenger API calls
 * @requires ui-dialogs - Confirmation dialogs
 */

import { escapeHtml } from './utils.js';
import { fetchMessengerChats, fetchMessengerMessages, sendPrivateMessage as apiSendPrivateMessage, deleteChat as apiDeleteChat } from './api.js';
import { showConfirmDialog } from './ui-dialogs.js';

/**
 * Current active private chat state.
 * Tracks the currently opened conversation with all its metadata.
 * @type {Object}
 * @property {number|null} chatId - Chat ID from API (null for new chats)
 * @property {string|null} subject - Conversation subject line
 * @property {string|null} targetCompanyName - Name of other participant
 * @property {number|null} targetUserId - User ID of other participant
 * @property {Array} messages - Array of message objects in this conversation
 * @property {boolean} isNewChat - True if creating new conversation
 * @property {boolean} isSystemChat - True if this is a system notification
 */
let currentPrivateChat = {
  chatId: null,
  subject: null,
  targetCompanyName: null,
  targetUserId: null,
  messages: [],
  isNewChat: false
};

/**
 * Array of all private chats fetched from API.
 * Includes both user conversations and system notifications.
 * @type {Array<Object>}
 */
let allPrivateChats = [];

/**
 * Filtered chats for current selection overlay.
 * Subset of allPrivateChats relevant to current target user.
 * @type {Array<Object>}
 */
let userChatsForSelection = [];

/**
 * Opens messenger interface for a specific user or system notifications.
 * Fetches all conversations and displays selection overlay or system message list.
 *
 * Special Handling:
 * - If targetCompanyName is "Gameplay", shows system notifications list
 * - Otherwise shows all conversations with the specified user
 * - Allows creating new conversation if none exist
 *
 * Side Effects:
 * - Fetches all messenger chats from API
 * - Updates allPrivateChats module variable
 * - Shows chat selection overlay
 *
 * @async
 * @param {string} targetCompanyName - Company name to message, or "Gameplay" for system notifications
 * @param {number|null} targetUserId - User ID of target (null for system messages)
 * @returns {Promise<void>}
 *
 * @example
 * // From alliance chat - user clicks @CompanyName
 * openMessenger("Player Company", 456);
 *
 * // From toolbar - user clicks Gameplay notifications
 * openMessenger("Gameplay", null);
 */
export async function openMessenger(targetCompanyName, targetUserId) {
  try {
    const data = await fetchMessengerChats();
    allPrivateChats = data.chats;

    // Check if this is for system messages
    if (targetCompanyName === 'Gameplay') {
      showSystemMessagesSelection(data.chats, data.own_user_id);
      return;
    }

    const userChats = allPrivateChats.filter(chat => {
      if (chat.system_chat) return false;
      return chat.participants_string === targetCompanyName;
    });

    showChatSelection(targetCompanyName, targetUserId, userChats, data.own_user_id);

  } catch (error) {
    console.error('Error opening messenger:', error);
    alert(`Error: ${error.message}`);
  }
}

function showSystemMessagesSelection(allChats, ownUserId) {
  const systemChats = allChats.filter(chat => chat.system_chat);
  const sortedChats = systemChats.sort((a, b) => (b.time_last_message || 0) - (a.time_last_message || 0));
  userChatsForSelection = sortedChats;

  document.getElementById('chatSelectionTitle').textContent = 'Gameplay - 📢 System Notifications';
  const listContainer = document.getElementById('chatSelectionList');

  if (sortedChats.length === 0) {
    listContainer.innerHTML = '<div class="empty-message">No system notifications yet.</div>';
  } else {
    listContainer.innerHTML = sortedChats.map((chat, index) => {
      const title = getSystemMessageTitle(chat.body, chat.values);
      const date = new Date(chat.time_last_message * 1000);
      const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const unreadIndicator = chat.new ? '<span class="unread-indicator"></span>' : '';

      return `
        <div class="chat-selection-item" data-chat-index="${index}" style="position: relative; padding-right: 40px;">
          <div style="flex: 1;">
            <h3>${title}${unreadIndicator}</h3>
            <p>${dateStr} ${timeStr}</p>
          </div>
          <button class="delete-chat-btn" data-chat-index="${index}" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #ef4444; padding: 4px; cursor: pointer; font-size: 20px;" onmouseover="this.style.animation='shake-trash 0.5s ease-in-out infinite'" onmouseout="this.style.animation='none'">🗑️</button>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.chat-selection-item').forEach(item => {
      const chatItem = item.querySelector('div[style*="flex: 1"]');
      if (chatItem) {
        chatItem.addEventListener('click', () => {
          const chatIndex = parseInt(item.dataset.chatIndex);
          const selectedChat = userChatsForSelection[chatIndex];
          document.getElementById('chatSelectionOverlay').style.display = 'none';
          openExistingChat('Gameplay', null, selectedChat, ownUserId);
        });
      }
    });

    listContainer.querySelectorAll('.delete-chat-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const chatIndex = parseInt(btn.dataset.chatIndex);
        const chatToDelete = sortedChats[chatIndex];
        await deleteChatWithConfirmation(chatToDelete);
        // Refresh the list
        showSystemMessagesSelection(allChats, ownUserId);
      });
    });
  }

  document.getElementById('chatSelectionOverlay').style.display = 'flex';
}

function showChatSelection(targetCompanyName, targetUserId, chats, ownUserId) {
  const sortedChats = [...chats].sort((a, b) => (b.time_last_message || 0) - (a.time_last_message || 0));
  userChatsForSelection = sortedChats;

  currentPrivateChat.targetCompanyName = targetCompanyName;
  currentPrivateChat.targetUserId = targetUserId;

  document.getElementById('chatSelectionTitle').textContent = `Conversations with ${targetCompanyName}`;
  const listContainer = document.getElementById('chatSelectionList');

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

  listContainer.querySelectorAll('.chat-selection-item').forEach(item => {
    item.addEventListener('click', async () => {
      if (item.dataset.isNew === 'true') {
        document.getElementById('chatSelectionOverlay').style.display = 'none';
        openNewChat(targetCompanyName, targetUserId);
      } else {
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
  const isSystemChat = chat.system_chat || false;

  currentPrivateChat = {
    chatId: chat.id,
    subject: chat.subject || 'Message',
    targetCompanyName: targetCompanyName,
    targetUserId: targetUserId,
    messages: [],
    isNewChat: false,
    isSystemChat: isSystemChat
  };

  document.getElementById('messengerOverlay').style.display = 'flex';

  // Set title based on chat type
  if (isSystemChat) {
    document.getElementById('messengerTitle').textContent = `${targetCompanyName} - 📢 System Notification`;
  } else {
    document.getElementById('messengerTitle').textContent = `${targetCompanyName} - ${chat.subject || 'Chat'}`;
  }

  document.getElementById('subjectInputWrapper').style.display = 'none';
  document.getElementById('messengerFeed').innerHTML = '<div class="empty-message">Loading...</div>';

  // System chats are single notifications, not conversations
  if (isSystemChat) {
    displaySystemMessage(chat);
    // Hide input area for system messages
    document.getElementById('messengerInput').style.display = 'none';
    document.getElementById('sendPrivateMessageBtn').style.display = 'none';
  } else {
    await loadPrivateMessages(chat.id);
    // Show input area for regular chats
    document.getElementById('messengerInput').style.display = 'block';
    document.getElementById('sendPrivateMessageBtn').style.display = 'block';
    document.getElementById('messengerInput').focus();
  }

  if (window.debouncedUpdateUnreadBadge) {
    setTimeout(() => window.debouncedUpdateUnreadBadge(1000), 1000);
  }
}

/**
 * Opens interface for creating a new conversation with a user.
 * Displays messenger overlay with subject input and empty message feed.
 *
 * Side Effects:
 * - Updates currentPrivateChat state with new chat parameters
 * - Shows messenger overlay
 * - Displays subject input field
 * - Focuses subject input for user entry
 *
 * @param {string} targetCompanyName - Company name of message recipient
 * @param {number} targetUserId - User ID of message recipient
 *
 * @example
 * // User clicks "New Conversation" from chat selection
 * openNewChat("Player Company", 456);
 */
export function openNewChat(targetCompanyName, targetUserId) {
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

/**
 * Loads and displays messages for a specific conversation.
 * Fetches message history from API and renders in bubble format.
 *
 * @async
 * @param {number} chatId - Chat ID to load messages for
 * @returns {Promise<void>}
 */
async function loadPrivateMessages(chatId) {
  try {
    const { messages, user_id: ownUserId } = await fetchMessengerMessages(chatId);
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

function getSystemMessageTitle(body, values) {
  if (!body) return 'System Notification';

  const v = values || {};

  if (body === 'vessel_got_hijacked') return '⚠️ Vessel Hijacked';
  if (body === 'user_bought_stock') return '📈 Stock Purchase';
  if (body === 'user_sold_stock') return '📉 Stock Sale';
  if (body.includes('alliance') && body.includes('donation')) return '💰 Alliance Donation';
  if (body.includes('accepted_to_join_alliance')) return '🤝 Alliance Joined';
  if (body.startsWith('intro_pm_')) return '📚 Tutorial Message';

  // Fallback: format the body text
  return body.replace(/_/g, ' ').replace(/\//g, ' ');
}

function displaySystemMessage(chat) {
  const feed = document.getElementById('messengerFeed');
  feed.innerHTML = '';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble system';
  bubble.style.background = 'rgba(59, 130, 246, 0.1)';
  bubble.style.borderColor = 'rgba(59, 130, 246, 0.3)';

  const date = new Date(chat.time_last_message * 1000);
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

  // Format the system message based on body type
  let messageContent = formatSystemMessage(chat.body, chat.values, chat.subject);

  bubble.innerHTML = `
    ${messageContent}
    <div style="font-size:10px; opacity:0.7; margin-top:10px;">${day} ${time}</div>
  `;

  feed.appendChild(bubble);
  feed.scrollTop = feed.scrollHeight;
}

function formatSystemMessage(body, values, subject) {
  // Handle different system message types
  if (!body) return '<div style="color: #94a3b8;">System notification (no details)</div>';

  const v = values || {};

  // Vessel hijacked
  if (body === 'vessel_got_hijacked' && v.vessel_name) {
    return `
      <div style="color: #ef4444; font-weight: bold;">⚠️ Vessel Hijacked!</div>
      <div style="margin-top: 8px;">
        <strong>Vessel:</strong> ${escapeHtml(v.vessel_name)}<br>
        <strong>Location:</strong> ${escapeHtml(v.tr_danger_zone || 'Unknown')}<br>
        <strong>Ransom:</strong> $${(v.requested_amount || 0).toLocaleString()}<br>
        <strong>Case ID:</strong> ${v.case_id || 'N/A'}
      </div>
    `;
  }

  // Stock transactions
  if (body === 'user_bought_stock' && v.stockOwner) {
    return `
      <div style="color: #4ade80;">📈 Stock Purchase</div>
      <div style="margin-top: 8px;">
        <strong>Company:</strong> ${escapeHtml(v.stockOwner)}<br>
        <strong>Shares:</strong> ${(v.stockAmount || 0).toLocaleString()}<br>
        <strong>Total Value:</strong> $${(v.totalAmount || 0).toLocaleString()}
      </div>
    `;
  }

  if (body === 'user_sold_stock' && v.stockOwner) {
    return `
      <div style="color: #fb923c;">📉 Stock Sale</div>
      <div style="margin-top: 8px;">
        <strong>Company:</strong> ${escapeHtml(v.stockOwner)}<br>
        <strong>Shares:</strong> ${(v.stockAmount || 0).toLocaleString()}<br>
        <strong>Total Value:</strong> $${(v.totalAmount || 0).toLocaleString()}
      </div>
    `;
  }

  // Alliance donation
  if (body.includes('alliance') && body.includes('donation') && v.amount) {
    return `
      <div style="color: #a78bfa;">💰 Alliance Donation</div>
      <div style="margin-top: 8px;">
        <strong>Amount:</strong> ${v.amount}<br>
        ${v.comment ? `<strong>Message:</strong> "${escapeHtml(v.comment)}"` : ''}
      </div>
    `;
  }

  // Alliance accepted
  if (body.includes('accepted_to_join_alliance') && v.alliance_name) {
    return `
      <div style="color: #4ade80;">🤝 Alliance Joined</div>
      <div style="margin-top: 8px;">
        You have joined <strong>${escapeHtml(v.alliance_name)}</strong>!
      </div>
    `;
  }

  // Tutorial/intro messages
  if (body.startsWith('intro_pm_')) {
    return `
      <div style="color: #60a5fa;">📚 Tutorial Message</div>
      <div style="margin-top: 8px;">
        ${subject ? escapeHtml(subject) : body}
      </div>
    `;
  }

  // Fallback: show raw data
  return `
    <div style="color: #94a3b8;"><strong>Type:</strong> ${escapeHtml(body)}</div>
    ${subject ? `<div style="margin-top: 5px;"><strong>Subject:</strong> ${escapeHtml(subject)}</div>` : ''}
    ${values ? `<div style="margin-top: 5px; font-size: 11px; opacity: 0.8;"><strong>Data:</strong> ${escapeHtml(JSON.stringify(values, null, 2))}</div>` : ''}
  `;
}

export function closeMessenger() {
  document.getElementById('messengerOverlay').style.display = 'none';
  currentPrivateChat = { chatId: null, subject: null, targetCompanyName: null, targetUserId: null, messages: [], isNewChat: false, isSystemChat: false };
  document.getElementById('messengerFeed').innerHTML = '';
  document.getElementById('messengerInput').value = '';
  document.getElementById('subjectInput').value = '';
  document.getElementById('subjectInputWrapper').style.display = 'none';
  // Restore input area visibility
  document.getElementById('messengerInput').style.display = 'block';
  document.getElementById('sendPrivateMessageBtn').style.display = 'block';
}

/**
 * Closes chat selection overlay and clears selection state.
 */
export function closeChatSelection() {
  document.getElementById('chatSelectionOverlay').style.display = 'none';
  userChatsForSelection = [];
}

/**
 * Displays overlay showing all private conversations sorted by recent activity.
 * Provides unified view of all chats with delete functionality per conversation.
 *
 * Features:
 * - Sorted by most recent message timestamp
 * - Shows message preview and timestamp
 * - Displays unread indicator badge
 * - Trash icon per chat for deletion
 * - Clicking chat opens full conversation
 *
 * Side Effects:
 * - Fetches all chats from API
 * - Shows all chats overlay
 * - Registers click handlers for each chat and delete button
 *
 * @async
 * @returns {Promise<void>}
 *
 * @example
 * // User clicks mailbox icon in toolbar
 * showAllChats();
 */
export async function showAllChats() {
  try {
    const data = await fetchMessengerChats();
    const chats = data.chats;

    const sortedChats = chats.sort((a, b) => (b.time_last_message || 0) - (a.time_last_message || 0));

    const listContainer = document.getElementById('allChatsList');

    if (sortedChats.length === 0) {
      listContainer.innerHTML = '<div class="empty-message">No private conversations yet.</div>';
    } else {
      listContainer.innerHTML = sortedChats.map((chat, index) => {
        const isSystemChat = chat.system_chat || false;
        const lastMsg = isSystemChat ? getSystemMessageTitle(chat.body, chat.values) : (chat.last_message ? escapeHtml(chat.last_message.substring(0, 60)) + '...' : 'No messages');
        const subject = isSystemChat ? '📢 System Notification' : (chat.subject || 'No subject');
        const participant = chat.participants_string || 'Unknown';
        const unreadIndicator = chat.new ? '<span class="unread-indicator"></span>' : '';

        // Format timestamp
        const date = new Date(chat.time_last_message * 1000);
        const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const timestamp = `${dateStr} ${timeStr}`;

        return `
          <div class="chat-selection-item" data-chat-index="${index}" style="position: relative; padding-right: 40px;">
            <div style="flex: 1;">
              <h3>${escapeHtml(participant)} - ${escapeHtml(subject)}${unreadIndicator}</h3>
              <p>${lastMsg}</p>
              <p style="font-size: 11px; opacity: 0.7; margin-top: 4px;">${timestamp}</p>
            </div>
            <button class="delete-chat-btn" data-chat-index="${index}" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #ef4444; padding: 4px; cursor: pointer; font-size: 20px;" onmouseover="this.style.animation='shake-trash 0.5s ease-in-out infinite'" onmouseout="this.style.animation='none'">🗑️</button>
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll('.chat-selection-item').forEach(item => {
        const chatItem = item.querySelector('div[style*="flex: 1"]');
        if (chatItem) {
          chatItem.addEventListener('click', () => {
            const chatIndex = parseInt(item.dataset.chatIndex);
            const selectedChat = sortedChats[chatIndex];

            const targetUserId = selectedChat.participant_ids?.find(id => id !== data.own_user_id);
            const targetCompanyName = selectedChat.participants_string;

            document.getElementById('allChatsOverlay').style.display = 'none';
            openExistingChat(targetCompanyName, targetUserId, selectedChat, data.own_user_id);
          });
        }
      });

      listContainer.querySelectorAll('.delete-chat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const chatIndex = parseInt(btn.dataset.chatIndex);
          const chatToDelete = sortedChats[chatIndex];

          await deleteChatWithConfirmation(chatToDelete);
        });
      });
    }

    document.getElementById('allChatsOverlay').style.display = 'flex';

  } catch (error) {
    console.error('Error loading all chats:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Closes the all chats overlay.
 */
export function closeAllChats() {
  document.getElementById('allChatsOverlay').style.display = 'none';
}

/**
 * Updates the unread message badge count in the UI.
 * Shows count of unread user messages (excludes system notifications).
 *
 * Badge Behavior:
 * - Visible only when unread count > 0
 * - Hidden when no unread messages
 * - Only counts non-system chats
 *
 * Side Effects:
 * - Fetches all messenger chats from API
 * - Updates badge visibility and count
 *
 * @async
 * @returns {Promise<void>}
 */
export async function updateUnreadBadge() {
  try {
    const data = await fetchMessengerChats();
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

export async function sendPrivateMessage() {
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
    subject = subjectInput.value.trim();
    if (!subject || subject.length === 0) {
      alert('Please enter a subject.');
      subjectInput.focus();
      return;
    }
  } else {
    subject = currentPrivateChat.subject;
  }

  sendBtn.disabled = true;
  messageInput.disabled = true;

  try {
    await apiSendPrivateMessage(currentPrivateChat.targetUserId, subject, message);

    messageInput.value = '';
    messageInput.style.height = 'auto';

    if (window.debouncedUpdateUnreadBadge) {
      window.debouncedUpdateUnreadBadge();
    }
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

export function getCurrentPrivateChat() {
  return currentPrivateChat;
}

async function deleteChatWithConfirmation(chat) {
  const participant = chat.participants_string || 'Unknown';
  const subject = chat.subject || 'No subject';
  const isSystemChat = chat.system_chat || false;

  const confirmed = await showConfirmDialog({
    title: '🗑️ Delete Chat',
    message: `Do you want to delete this conversation?`,
    details: [
      { label: 'Participant', value: participant },
      { label: 'Subject', value: subject }
    ],
    confirmText: 'Delete',
    cancelText: 'Cancel'
  });

  if (!confirmed) return;

  try {
    await apiDeleteChat(chat.id, isSystemChat);
    showAllChats();

    if (window.debouncedUpdateUnreadBadge) {
      window.debouncedUpdateUnreadBadge();
    }
  } catch (error) {
    alert(`Error deleting chat: ${error.message}`);
  }
}

export async function deleteCurrentChat() {
  if (!currentPrivateChat.chatId) {
    alert('No chat to delete');
    return;
  }

  const confirmed = await showConfirmDialog({
    title: '🗑️ Delete Chat',
    message: `Do you want to delete this conversation?`,
    details: [
      { label: 'Participant', value: currentPrivateChat.targetCompanyName },
      { label: 'Subject', value: currentPrivateChat.subject }
    ],
    confirmText: 'Delete',
    cancelText: 'Cancel'
  });

  if (!confirmed) return;

  try {
    await apiDeleteChat(currentPrivateChat.chatId, currentPrivateChat.isSystemChat || false);
    closeMessenger();

    if (window.debouncedUpdateUnreadBadge) {
      window.debouncedUpdateUnreadBadge();
    }
  } catch (error) {
    alert(`Error deleting chat: ${error.message}`);
  }
}
