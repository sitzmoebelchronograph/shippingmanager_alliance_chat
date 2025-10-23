/**
 * @fileoverview API module for all client-server communication.
 * Handles all HTTP requests to the backend API endpoints including chat,
 * vessels, bunker management, messenger, campaigns, and user data.
 *
 * All functions implement proper error handling and return promises.
 * Company names are cached to reduce API calls.
 *
 * @module api
 */

/**
 * Cache for storing user company names to reduce API calls.
 * Key: userId (number), Value: companyName (string)
 * @type {Map<number, string>}
 */
const userCache = new Map();

/**
 * Fetches company name for a user with caching.
 * Returns cached value if available, otherwise fetches from API.
 * Falls back to "User {id}" if fetch fails.
 *
 * @param {number|string} userId - User ID to fetch company name for
 * @returns {Promise<string>} Company name or fallback string
 * @example
 * const name = await getCompanyNameCached(123);
 * // => "Acme Shipping Co."
 */
export async function getCompanyNameCached(userId) {
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

/**
 * Fetches the list of all alliance members.
 * Returns empty array if request fails.
 *
 * @returns {Promise<Array<Object>>} Array of alliance member objects
 * @property {number} user_id - Member's user ID
 * @property {string} company_name - Member's company name
 */
export async function fetchAllianceMembers() {
  try {
    const response = await fetch('/api/alliance-members');
    if (!response.ok) throw new Error('Failed to load alliance members');
    return await response.json();
  } catch (error) {
    console.error('Error loading alliance members:', error);
    return [];
  }
}

/**
 * Fetches the alliance chat feed including both chat messages and system feed events.
 *
 * @returns {Promise<Object>} Chat data object
 * @property {Array<Object>} feed - Array of chat/feed events
 * @property {number} own_user_id - Current user's ID
 * @property {string} own_company_name - Current user's company name
 * @throws {Error} If fetch fails
 */
export async function fetchChat() {
  try {
    const response = await fetch('/api/chat');
    if (!response.ok) throw new Error('Failed to load chat feed');
    return await response.json();
  } catch (error) {
    console.error('Error loading messages:', error);
    throw error;
  }
}

/**
 * Sends a message to the alliance chat.
 * Message must be valid according to game rules (length, content).
 *
 * @param {string} message - Message text to send
 * @returns {Promise<Object>} Response data from server
 * @property {boolean} success - Whether message was sent successfully
 * @throws {Error} If message sending fails or validation fails
 */
export async function sendChatMessage(message) {
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

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches all vessels owned by the current user.
 * Includes vessels in harbor, at sea, and pending delivery.
 *
 * @returns {Promise<Object>} Vessel data object
 * @property {Array<Object>} vessels - Array of vessel objects
 * @property {Object} vessels[].vessel_id - Unique vessel ID
 * @property {string} vessels[].name - Vessel name
 * @property {string} vessels[].status - Status (harbor/at_sea/pending)
 * @property {number} vessels[].wear - Wear percentage (0-100)
 * @throws {Error} If fetch fails
 */
export async function fetchVessels() {
  try {
    const response = await fetch('/api/vessel/get-vessels');
    if (!response.ok) throw new Error('Failed to get vessels');
    return await response.json();
  } catch (error) {
    console.error('Error fetching vessels:', error);
    throw error;
  }
}

/**
 * Fetches current user settings and account information.
 *
 * @returns {Promise<Object>} User settings object
 * @property {number} user_id - User ID
 * @property {string} company_name - Company name
 * @property {number} cash - Current cash balance
 * @throws {Error} If fetch fails
 */
export async function fetchUserSettings() {
  try {
    const response = await fetch('/api/user/get-settings');
    if (!response.ok) throw new Error('Failed to get user settings');
    return await response.json();
  } catch (error) {
    console.error('Error fetching user settings:', error);
    throw error;
  }
}

/**
 * Fetches current bunker fuel and CO2 prices.
 * Prices fluctuate based on game economy and are updated every 30-35 seconds.
 *
 * @returns {Promise<Object>} Bunker prices and status
 * @property {number} fuel_price - Current fuel price per ton
 * @property {number} co2_price - Current CO2 price per ton
 * @property {number} current_fuel - Current fuel in bunker
 * @property {number} max_fuel - Maximum fuel capacity
 * @property {number} current_co2 - Current CO2 in bunker
 * @property {number} max_co2 - Maximum CO2 capacity
 * @property {number} current_cash - Current cash balance
 * @throws {Error} If fetch fails
 */
export async function fetchBunkerPrices() {
  try {
    const response = await fetch('/api/bunker/get-prices');
    if (!response.ok) throw new Error('Failed to get bunker prices');
    return await response.json();
  } catch (error) {
    console.error('Error fetching bunker prices:', error);
    throw error;
  }
}

/**
 * Purchases fuel for the bunker.
 * Amount is multiplied by 1000 before sending (API expects millitons).
 *
 * @param {number} amount - Amount of fuel to purchase in tons
 * @returns {Promise<Object>} Purchase result
 * @property {boolean} success - Whether purchase was successful
 * @property {number} new_balance - New cash balance after purchase
 * @throws {Error} If purchase fails (insufficient funds, invalid amount)
 */
export async function purchaseFuel(amount) {
  try {
    const response = await fetch('/api/bunker/purchase-fuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(amount * 1000) })
    });
    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Purchases CO2 credits for the bunker.
 * Amount is multiplied by 1000 before sending (API expects millitons).
 *
 * @param {number} amount - Amount of CO2 to purchase in tons
 * @returns {Promise<Object>} Purchase result
 * @property {boolean} success - Whether purchase was successful
 * @property {number} new_balance - New cash balance after purchase
 * @throws {Error} If purchase fails (insufficient funds, invalid amount)
 */
export async function purchaseCO2(amount) {
  try {
    const response = await fetch('/api/bunker/purchase-co2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(amount * 1000) })
    });
    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Departs all vessels currently in harbor that have available routes and fuel.
 * Part of the auto-depart feature.
 *
 * @returns {Promise<Object>} Departure result
 * @property {number} departed - Number of vessels departed
 * @property {Array<string>} errors - Array of error messages for vessels that couldn't depart
 * @throws {Error} If request fails
 */
export async function departAllVessels() {
  try {
    const response = await fetch('/api/route/depart-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to depart vessels');
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches the user's contact list.
 * Returns both regular contacts and alliance contacts.
 *
 * @returns {Promise<Object>} Contact data
 * @property {Array<Object>} contacts - Regular contacts
 * @property {Array<Object>} alliance_contacts - Alliance member contacts
 * @throws {Error} If fetch fails
 */
export async function fetchContacts() {
  try {
    const response = await fetch('/api/contact/get-contacts');
    if (!response.ok) throw new Error('Failed to get contacts');
    return await response.json();
  } catch (error) {
    console.error('Error loading contact list:', error);
    throw error;
  }
}

/**
 * Fetches all messenger chats for the current user.
 * Includes both regular chats and system messages.
 *
 * @returns {Promise<Object>} Messenger data
 * @property {Array<Object>} chats - Array of chat conversations
 * @property {number} own_user_id - Current user's ID
 * @property {string} own_company_name - Current user's company name
 * @throws {Error} If fetch fails
 */
export async function fetchMessengerChats() {
  try {
    const response = await fetch('/api/messenger/get-chats');
    if (!response.ok) throw new Error('Failed to get chats');
    return await response.json();
  } catch (error) {
    console.error('Error getting chats:', error);
    throw error;
  }
}

/**
 * Fetches all messages for a specific chat conversation.
 *
 * @param {number} chatId - Chat ID to fetch messages for
 * @returns {Promise<Object>} Messages data
 * @property {Array<Object>} messages - Array of message objects
 * @throws {Error} If fetch fails
 */
export async function fetchMessengerMessages(chatId) {
  try {
    const response = await fetch('/api/messenger/get-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId })
    });

    if (!response.ok) throw new Error('Failed to load messages');
    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Sends a private message to another user.
 * Creates a new chat or continues existing conversation.
 *
 * @param {number} targetUserId - Recipient's user ID
 * @param {string} subject - Message subject (only for new chats)
 * @param {string} message - Message content
 * @returns {Promise<Object>} Send result
 * @property {boolean} success - Whether message was sent
 * @throws {Error} If send fails or validation fails
 */
export async function sendPrivateMessage(targetUserId, subject, message) {
  try {
    const response = await fetch('/api/messenger/send-private', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_id: targetUserId,
        subject: subject,
        message: message
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Deletes a chat conversation or system message.
 * System messages and regular chats are handled differently by the API.
 *
 * @param {number} chatId - Chat ID to delete
 * @param {boolean} [isSystemChat=false] - Whether this is a system message
 * @returns {Promise<Object>} Deletion result
 * @property {boolean} success - Whether deletion was successful
 * @throws {Error} If deletion fails
 */
export async function deleteChat(chatId, isSystemChat = false) {
  try {
    const response = await fetch('/api/messenger/delete-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_ids: isSystemChat ? '[]' : `[${chatId}]`,
        system_message_ids: isSystemChat ? `[${chatId}]` : '[]'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete chat');
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches available marketing campaigns and currently active campaigns.
 * Campaigns provide temporary bonuses (reputation, awareness, green).
 *
 * @returns {Promise<Object>} Campaign data
 * @property {Object} data - Campaign data
 * @property {Array<Object>} data.marketing_campaigns - All available campaigns
 * @property {Array<Object>} data.active_campaigns - Currently active campaigns
 * @property {Object} user - User data including reputation
 * @throws {Error} If fetch fails
 */
export async function fetchCampaigns() {
  try {
    const response = await fetch('/api/marketing/get-campaigns');
    if (!response.ok) throw new Error('Failed to fetch campaigns');
    return await response.json();
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    throw error;
  }
}

/**
 * Activates a marketing campaign by purchasing it.
 * Only 3 campaigns can be active simultaneously (one of each type).
 *
 * @param {number} campaignId - Campaign ID to activate
 * @returns {Promise<Object>} Activation result
 * @property {boolean} success - Whether activation was successful
 * @property {number} new_balance - New cash balance after purchase
 * @throws {Error} If activation fails (insufficient funds, already active)
 */
export async function activateCampaign(campaignId) {
  try {
    const response = await fetch('/api/marketing/activate-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId })
    });

    if (!response.ok) throw new Error('Failed to activate campaign');
    return await response.json();
  } catch (error) {
    console.error('Error activating campaign:', error);
    throw error;
  }
}

/**
 * Fetches all vessels available for purchase in the market.
 * Includes vessel specifications, prices, and engine types.
 *
 * @returns {Promise<Object>} Available vessels data
 * @property {Array<Object>} vessels - Array of purchasable vessels
 * @throws {Error} If fetch fails
 */
export async function fetchAcquirableVessels() {
  try {
    const response = await fetch('/api/vessel/get-all-acquirable');
    if (!response.ok) throw new Error('Failed to load vessels');
    return await response.json();
  } catch (error) {
    console.error('Error loading vessels:', error);
    throw error;
  }
}

/**
 * Purchases a vessel from the market.
 * User provides name and antifouling choice during purchase.
 *
 * @param {number} vesselId - Vessel ID to purchase
 * @param {string} name - Custom name for the vessel
 * @param {string} antifouling - Antifouling model choice
 * @returns {Promise<Object>} Purchase result
 * @property {boolean} success - Whether purchase was successful
 * @property {number} new_balance - New cash balance
 * @throws {Error} If purchase fails (insufficient funds, invalid name)
 */
export async function purchaseVessel(vesselId, name, antifouling) {
  try {
    const response = await fetch('/api/vessel/purchase-vessel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vessel_id: vesselId,
        name: name,
        antifouling_model: antifouling
      })
    });

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Gets the total maintenance cost for specified vessels.
 * Used before performing bulk repair to show cost to user.
 *
 * @param {Array<number>} vesselIds - Array of vessel IDs to check cost for
 * @returns {Promise<Object>} Cost data
 * @property {number} total_cost - Total repair cost
 * @throws {Error} If request fails
 */
export async function getMaintenanceCost(vesselIds) {
  try {
    const response = await fetch('/api/maintenance/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_ids: JSON.stringify(vesselIds) })
    });

    if (!response.ok) throw new Error('Failed to get repair cost');
    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Performs wear maintenance (repair) on multiple vessels at once.
 * Used by auto-repair feature and manual bulk repair button.
 *
 * @param {Array<number>} vesselIds - Array of vessel IDs to repair
 * @returns {Promise<Object>} Repair result
 * @property {number} repaired - Number of vessels repaired
 * @property {number} cost - Total cost of repairs
 * @throws {Error} If repair fails (insufficient funds)
 */
export async function doWearMaintenanceBulk(vesselIds) {
  try {
    const response = await fetch('/api/maintenance/do-wear-maintenance-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_ids: JSON.stringify(vesselIds) })
    });

    if (!response.ok) throw new Error('Failed to repair vessels');
    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Departs a single vessel on its assigned route.
 * Used by intelligent auto-depart to send only profitable vessels.
 *
 * @param {number} vesselId - Vessel ID to depart
 * @param {number} speed - Speed to travel at (usually % of max_speed)
 * @param {number} [guards=0] - Number of guards (0 or 10 based on hijacking_risk)
 * @returns {Promise<Object>} Departure result
 * @property {boolean} success - Whether vessel was departed successfully
 * @throws {Error} If departure fails (no route, insufficient fuel)
 */
export async function departVessel(vesselId, speed, guards = 0) {
  try {
    const response = await fetch('/api/route/depart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_vessel_id: vesselId,
        speed: speed,
        guards: guards,
        history: 0
      })
    });

    if (!response.ok) {
      throw new Error('Failed to depart vessel');
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches demand and consumed data for all assigned ports.
 * Used by intelligent auto-depart to calculate remaining port capacity.
 *
 * @returns {Promise<Array<Object>>} Array of port objects with demand/consumed data
 * @property {string} code - Port code (e.g., "BOS")
 * @property {Object} demand - Port demand for container and tanker cargo
 * @property {Object} consumed - Amount already delivered to port
 * @throws {Error} If fetch fails
 */
export async function fetchAssignedPorts() {
  try {
    const response = await fetch('/api/port/get-assigned-ports');
    if (!response.ok) throw new Error('Failed to fetch assigned ports');
    const data = await response.json();
    return data.data?.ports || [];
  } catch (error) {
    console.error('Error fetching assigned ports:', error);
    throw error;
  }
}
