/**
 * @fileoverview Chat Bot System
 *
 * Handles automated responses to alliance chat commands and private messages.
 * Features:
 * - Command parsing and execution
 * - Private message auto-reply
 * - Scheduled message sending
 * - Custom command management
 * - Rate limiting and cooldowns
 *
 * @module server/chatbot
 */

const fs = require('fs').promises;
const path = require('path');
const { apiCall, getAllianceId, getUserId } = require('./utils/api');
const { triggerImmediateChatRefresh, triggerImmediateMessengerRefresh } = require('./websocket');
const { getSettingsFilePath } = require('./settings-schema');
const { getAppDataDir } = require('./config');
const logger = require('./utils/logger');

/**
 * ChatBot class handles all bot functionality
 */
class ChatBot {
    constructor() {
        this.settings = null;
        this.lastCommandTime = new Map(); // userId -> { command -> timestamp }
        this.processedMessages = new Set(); // Track processed DMs to avoid duplicates
        this.scheduledTasks = new Map(); // taskId -> timeout
        this.initialized = false;
    }

    /**
     * Initialize the chat bot with settings
     */
    async initialize() {
        try {
            await this.loadSettings();
            this.setupScheduledTasks();
            this.initialized = true;
            logger.log('[ChatBot] Initialized successfully');
        } catch (error) {
            logger.error('[ChatBot] Failed to initialize:', error);
        }
    }

    /**
     * Load settings from per-user settings file (settings-{userId}.json)
     */
    async loadSettings() {
        try {
            const userId = getUserId();
            if (!userId) {
                logger.error('[ChatBot] No user ID available');
                this.settings = this.getDefaultChatBotObject();
                return;
            }

            const settingsPath = getSettingsFilePath(userId);
            const data = await fs.readFile(settingsPath, 'utf8');
            const allSettings = JSON.parse(data);

            // Map per-user settings to chatbot settings object
            this.settings = this.mapSettingsToChatBotObject(allSettings);
            logger.log('[ChatBot] Settings loaded');
        } catch (error) {
            logger.error('[ChatBot] Error loading settings:', error);
            this.settings = this.getDefaultChatBotObject();
        }
    }

    /**
     * Map per-user settings to chatbot settings object
     */
    mapSettingsToChatBotObject(settings) {
        return {
            enabled: settings.chatbotEnabled || false,
            commandPrefix: settings.chatbotPrefix || '!',
            allianceCommands: {
                enabled: settings.chatbotAllianceCommandsEnabled || false,
                cooldownSeconds: settings.chatbotCooldownSeconds || 30
            },
            commands: {
                forecast: {
                    enabled: settings.chatbotForecastCommandEnabled || false,
                    responseType: 'dm',
                    adminOnly: false,
                    aliases: settings.chatbotForecastAliases || ['prices', 'price']
                },
                help: {
                    enabled: settings.chatbotHelpCommandEnabled || false,
                    responseType: 'dm',
                    adminOnly: false,
                    aliases: settings.chatbotHelpAliases || ['commands', 'help']
                }
            },
            scheduledMessages: {
                dailyForecast: {
                    enabled: settings.chatbotDailyForecastEnabled || false,
                    timeUTC: settings.chatbotDailyForecastTime || '18:00',
                    dayOffset: 1 // 1 = tomorrow
                }
            },
            dmCommands: {
                enabled: settings.chatbotDMCommandsEnabled || false
            },
            customCommands: settings.chatbotCustomCommands || []
        };
    }

    /**
     * Get default chat bot settings object
     */
    getDefaultChatBotObject() {
        return {
            enabled: false,
            commandPrefix: '!',
            allianceCommands: {
                enabled: true,
                cooldownSeconds: 30
            },
            commands: {
                forecast: {
                    enabled: true,
                    responseType: 'dm',
                    adminOnly: false
                },
                help: {
                    enabled: true,
                    responseType: 'dm',
                    adminOnly: false
                }
            },
            scheduledMessages: {
                dailyForecast: {
                    enabled: false,
                    timeUTC: '18:00',
                    dayOffset: 1 // 1 = tomorrow
                }
            },
            dmCommands: {
                enabled: false
            },
            customCommands: []
        };
    }

    /**
     * Map ChatBot object to flat per-user settings keys
     * This is the reverse operation of mapSettingsToChatBotObject()
     * @param {Object} chatbotSettings - Nested ChatBot settings object
     * @returns {Object} Flat settings keys for per-user settings file
     */
    mapChatBotObjectToFlatSettings(chatbotSettings) {
        const flatSettings = {};

        flatSettings.chatbotEnabled = chatbotSettings.enabled || false;
        flatSettings.chatbotPrefix = chatbotSettings.commandPrefix || '!';

        if (chatbotSettings.allianceCommands) {
            flatSettings.chatbotAllianceCommandsEnabled = chatbotSettings.allianceCommands.enabled || false;
            flatSettings.chatbotCooldownSeconds = chatbotSettings.allianceCommands.cooldownSeconds || 30;
        }

        if (chatbotSettings.commands?.forecast) {
            flatSettings.chatbotForecastCommandEnabled = chatbotSettings.commands.forecast.enabled || false;
        }

        if (chatbotSettings.commands?.help) {
            flatSettings.chatbotHelpCommandEnabled = chatbotSettings.commands.help.enabled || false;
        }

        if (chatbotSettings.scheduledMessages?.dailyForecast) {
            flatSettings.chatbotDailyForecastEnabled = chatbotSettings.scheduledMessages.dailyForecast.enabled || false;
            flatSettings.chatbotDailyForecastTime = chatbotSettings.scheduledMessages.dailyForecast.timeUTC || '18:00';
        }

        if (chatbotSettings.dmCommands) {
            flatSettings.chatbotDMCommandsEnabled = chatbotSettings.dmCommands.enabled || false;
        }

        flatSettings.chatbotCustomCommands = chatbotSettings.customCommands || [];

        return flatSettings;
    }

    /**
     * Resolve command name from input (including aliases)
     * @param {string} input - Command input string
     * @returns {string|null} - Resolved command name or null if not found
     */
    resolveCommandName(input) {
        const commandLower = input.toLowerCase();

        // Check exact match first
        if (this.settings.commands[commandLower]) {
            return commandLower;
        }

        // Check aliases
        for (const [cmdName, cmdConfig] of Object.entries(this.settings.commands)) {
            if (cmdConfig.aliases && cmdConfig.aliases.includes(commandLower)) {
                return cmdName;
            }
        }

        // Check custom commands
        return null;
    }

    /**
     * Process alliance chat message for commands
     */
    async processAllianceMessage(message, userId, userName) {
        if (!this.settings?.enabled) {
            return;
        }

        if (!this.settings?.allianceCommands?.enabled) {
            return;
        }

        // Check if message starts with command prefix
        const prefix = this.settings.commandPrefix || '!';
        if (!message.startsWith(prefix)) {
            // Not a command, ignore silently
            return;
        }

        // Parse command
        const parts = message.slice(prefix.length).trim().split(/\s+/);
        const commandInput = parts[0].toLowerCase();
        const args = parts.slice(1);

        logger.log(`[ChatBot] Command from ${userName}: !${commandInput} ${args.join(' ')}`);

        // Resolve command name (including aliases)
        const command = this.resolveCommandName(commandInput);
        if (!command) {
            // Check custom commands as fallback
            const customCmd = this.findCustomCommand(commandInput);
            if (!customCmd || !customCmd.enabled) {
                return; // Ignore unknown or disabled commands
            }
            // Custom command handling would go here
            return;
        }

        // Get command config
        const cmdConfig = this.settings.commands[command];
        if (!cmdConfig || !cmdConfig.enabled) {
            return; // Ignore disabled commands
        }

        // Check if command is allowed in alliance chat based on settings
        const isAllianceAllowed = this.isCommandAllowedInChannel(command, 'alliance');
        if (!isAllianceAllowed) {
            logger.log(`[ChatBot] Command '${command}' not allowed in alliance chat per settings`);
            return;
        }

        // Validate arguments BEFORE executing command
        if (!this.validateCommandArguments(command, args)) {
            logger.debug(`[ChatBot] Invalid arguments for command '${command}': [${args.join(', ')}]`);
            return;
        }

        // Check admin permission
        const { getUserId } = require('./utils/api');
        const currentUserId = getUserId();
        if (cmdConfig.adminOnly && userId !== currentUserId) {
            logger.log(`[ChatBot] User ${userId} tried admin command ${command}`);
            return;
        }

        // Check cooldown
        if (this.isOnCooldown(userId, command)) {
            logger.log(`[ChatBot] Command ${command} on cooldown for user ${userId}`);
            return;
        }

        // Execute command
        try {
            await this.executeCommand(command, args, userId, userName, cmdConfig);
            this.updateCooldown(userId, command);
        } catch (error) {
            logger.error(`[ChatBot] Error executing command ${command}:`, error);
            // Errors ONLY go to console - no messages to users!
        }
    }

    /**
     * Process private message for auto-reply
     * Subject is ignored - only message body is parsed for commands
     */
    async processPrivateMessage(messageId, body, senderId, senderName) {
        if (!this.settings?.enabled || !this.settings?.dmCommands?.enabled) {
            logger.debug(`[ChatBot] DM processing disabled - enabled:${this.settings?.enabled} dmCommands:${this.settings?.dmCommands?.enabled}`);
            return false;
        }

        // Check if already processed
        if (this.processedMessages.has(messageId)) {
            return false;
        }

        // IMPORTANT: Parse command from message BODY only (subject is ignored)
        // In DMs, prefix is OPTIONAL (e.g., "forecast 2 GMT" or "!forecast 2 GMT")
        const prefix = this.settings.commandPrefix || '!';
        const bodyTrimmed = body.trim();

        logger.debug(`[ChatBot] Processing DM body: "${bodyTrimmed}"`);

        // Try with prefix first, then without
        let commandText;
        if (bodyTrimmed.startsWith(prefix)) {
            // Has prefix: "!forecast 2 GMT"
            commandText = bodyTrimmed.slice(prefix.length).trim();
        } else {
            // No prefix: "forecast 2 GMT"
            commandText = bodyTrimmed;
        }

        const parts = commandText.split(/\s+/);
        const commandInput = parts[0].toLowerCase();
        const args = parts.slice(1);

        logger.debug(`[ChatBot] Parsed command:"${commandInput}" args:[${args.join(', ')}]`);

        // Resolve command name (including aliases)
        const command = this.resolveCommandName(commandInput);
        if (!command) {
            logger.debug(`[ChatBot] Command not resolved: "${commandInput}"`);
            // Check custom commands as fallback
            const customCmd = this.findCustomCommand(commandInput);
            if (!customCmd || !customCmd.enabled) {
                return false; // Not a valid command
            }
            // Custom command handling would go here
            return false;
        }

        logger.debug(`[ChatBot] Resolved command: "${command}"`);

        // Get command config
        const cmdConfig = this.settings.commands[command];
        if (!cmdConfig || !cmdConfig.enabled) {
            logger.debug(`[ChatBot] Command "${command}" not enabled in config`);
            return false;
        }

        // Check if command is allowed in DMs based on settings
        const isDMAllowed = this.isCommandAllowedInChannel(command, 'dm');
        if (!isDMAllowed) {
            logger.debug(`[ChatBot] Command "${command}" not allowed in DMs`);
            return false;
        }

        // Validate arguments BEFORE executing command
        if (!this.validateCommandArguments(command, args)) {
            logger.debug(`[ChatBot] Invalid arguments for DM command '${command}': [${args.join(', ')}]`);
            return false;
        }

        logger.log(`[ChatBot] DM command from ${senderName}: !${command}`);

        // Mark as processed
        this.processedMessages.add(messageId);

        // Execute command
        try {
            await this.executeCommand(command, args, senderId, senderName, cmdConfig, true);

            return true;
        } catch (error) {
            logger.error(`[ChatBot] Error processing DM command ${command}:`, error);
            // Errors ONLY go to console - no messages to users!
            return true; // Still mark as processed
        }
    }

    /**
     * Execute a command
     */
    async executeCommand(command, args, userId, userName, config, isDM = false) {
        switch (command) {
            case 'forecast':
                await this.handleForecastCommand(args, userId, userName, config, isDM);
                break;

            case 'help':
                await this.handleHelpCommand(userId, userName, config, isDM);
                break;

            default:
                // Custom command
                if (config.message) {
                    await this.sendResponse(config.message, config.responseType, userId, isDM);
                }
                break;
        }
    }

    /**
     * Handle forecast command
     */
    async handleForecastCommand(args, userId, userName, config, isDM) {
        // Parse arguments
        const now = new Date();
        let day;
        let responseType = config.responseType || 'dm';

        // If no arguments, use tomorrow (default forecast behavior)
        if (args.length === 0) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            day = tomorrow.getDate();
        } else {
            day = parseInt(args[0]) || now.getDate() + 1; // Default to tomorrow if arg invalid
        }

        // Default timezone: undefined = server will use its local timezone
        // This allows the API to determine the appropriate timezone
        let timezone = args[1] || undefined;

        // Validate day (1-31)
        if (day < 1 || day > 31) {
            throw new Error('Invalid day. Please specify a day between 1 and 31.');
        }

        // Validate timezone if provided
        const validTimezones = [
            'PST', 'PDT', 'MST', 'MDT', 'CST', 'CDT', 'EST', 'EDT',
            'GMT', 'BST', 'WET', 'WEST', 'CET', 'CEST', 'EET', 'EEST',
            'JST', 'KST', 'IST',
            'AEST', 'AEDT', 'ACST', 'ACDT', 'AWST',
            'NZST', 'NZDT',
            'UTC'
        ];

        if (timezone && !validTimezones.includes(timezone.toUpperCase())) {
            // Invalid timezone - send error message
            const errorMsg = `❌ Invalid timezone: "${timezone}"\n\n`;
            const tzList = `⁉️ Supported timezones:\n${validTimezones.join(', ')}`;
            await this.sendResponse(errorMsg + tzList, responseType, userId, isDM);
            return; // Exit early
        }

        // Normalize timezone to uppercase (if provided)
        if (timezone) {
            timezone = timezone.toUpperCase();
        }

        // Get forecast data
        const forecastText = await this.generateForecastText(day, timezone);

        // Only send response if we got valid forecast text
        if (forecastText && forecastText.trim()) {
            await this.sendResponse(forecastText, responseType, userId, isDM);
        } else {
            logger.log('[ChatBot] No forecast text generated - skipping response');
        }
    }

    /**
     * Generate forecast text for a specific day
     * @param {number} day - Day of month (1-31)
     * @param {string|undefined} timezone - Timezone abbreviation (undefined = server local timezone)
     */
    async generateForecastText(day, timezone) {
        try {
            logger.log(`[ChatBot] Generating forecast for day ${day}${timezone ? ` in ${timezone}` : ' (server timezone)'}`);

            // Use the existing forecast API endpoint (includes event discounts, formatting, etc.)
            const axios = require('axios');
            const { getSessionCookie } = require('./config');

            // Build query parameters
            const params = new URLSearchParams({
                source: 'chatbot',
                day: day.toString()
            });

            if (timezone) {
                params.append('timezone', timezone);
            }

            // Call internal API endpoint
            const response = await axios.get(`https://localhost:12345/api/forecast?${params.toString()}`, {
                headers: {
                    'Cookie': `shipping_manager_session=${getSessionCookie()}`
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            });

            const forecastText = response.data;

            logger.log(`[ChatBot] Forecast generated successfully for day ${day}`);
            return forecastText;

        } catch (error) {
            logger.error('[ChatBot] Error generating forecast:', error.message);
            logger.debug('[ChatBot] Full error:', error);
            // Return empty response on error - no error messages to users
            return '';
        }
    }

    /**
     * Handle help command
     */
    async handleHelpCommand(userId, userName, config, isDM) {
        const prefix = this.settings.commandPrefix || '!';

        let helpText = '🤖 Available Commands\n\n';

        // Built-in commands
        if (this.settings.commands.forecast?.enabled) {
            helpText += `👉 Get fuel and CO₂ price forecast\n\n`;
            helpText += `${prefix}forecast [day] [timezone]\n`;
            helpText += `• day: 1-31 (default: tomorrow)\n`;
            helpText += `• timezone: (default: server timezone)\n\n`;
            helpText += `💡 Examples\n`;
            helpText += `• ${prefix}forecast 26 UTC\n`;
            helpText += `• ${prefix}forecast 15\n`;
            helpText += `• ${prefix}forecast\n\n`;
            helpText += `⁉️ Supported timezones:\n`;
            helpText += `PST, PDT, MST, MDT, CST, CDT, EST, EDT, GMT, BST, WET, WEST, CET, CEST, EET, EEST, JST, KST, IST, AEST, AEDT, ACST, ACDT, AWST, NZST, NZDT, UTC\n\n`;
        }

        if (this.settings.commands.help?.enabled) {
            helpText += `👉 Show help\n\n`;
            helpText += `${prefix}help\n\n`;
        }

        // Custom commands
        for (const cmd of this.settings.customCommands || []) {
            if (cmd.enabled) {
                helpText += `👉 ${cmd.description || 'Custom command'}\n\n`;
                helpText += `${prefix}${cmd.trigger}`;
                if (cmd.adminOnly) {
                    helpText += ' (admin only)';
                }
                helpText += '\n\n';
            }
        }

        helpText += `Response times may vary up to 15 seconds - keep calm :)`;

        await this.sendResponse(helpText, config.responseType || 'public', userId, isDM);
    }

    /**
     * Send response based on type
     */
    async sendResponse(message, responseType, userId, isDM) {

        // Bot owner ALWAYS gets public responses in alliance chat
        const { getUserId } = require('./utils/api');
        const myUserId = getUserId();
        if (userId === myUserId && !isDM) {
            // If bot owner writes in alliance chat, always respond publicly
            responseType = 'public';
        } else if (responseType === 'dm' && userId === myUserId) {
            // Never send DM to myself (bot owner)
            responseType = 'public';
        }

        if (isDM && responseType === 'public') {
            // If command came from DM but wants public response, send to DM instead
            responseType = 'dm';
        }

        switch (responseType) {
            case 'public':
                await this.sendAllianceMessage(message);
                break;

            case 'dm':
                const result = await this.sendPrivateMessage(userId, 'Bot Response', message);

                // If self-DM failed, fall back to public response
                if (!result) {
                    const { getUserId } = require('./utils/api');
                    const myUserId = getUserId();
                    if (userId === myUserId) {
                        // Send shortened public response
                        const shortMsg = message.length > 200 ?
                            message.substring(0, 197) + '...' :
                            message;
                        await this.sendAllianceMessage(`[Auto-Reply] ${shortMsg}`);
                    }
                }
                break;

            case 'both':
                await this.sendAllianceMessage(message.substring(0, 200) + '...'); // Short version
                await this.sendPrivateMessage(userId, 'Full Response', message);
                break;
        }
    }

    /**
     * Log error to console only - NEVER send errors to chat or DM
     */
    async sendErrorMessage(userId, command, error) {
        // ONLY log to console - no messages to users
        logger.error(`[ChatBot] Error executing command '${command}' for user ${userId}:`, error);
        // That's it - no sending messages anywhere!
    }

    /**
     * Send alliance message
     */
    async sendAllianceMessage(message) {
        try {
            const allianceId = getAllianceId();

            // CRITICAL: Game API has 1000 character limit
            if (message.length > 1000) {
                logger.error(`[ChatBot] ⚠️ WARNING: Message too long! ${message.length} chars (max: 1000)`);
                logger.error(`[ChatBot] Message will be truncated to avoid API error`);

                // Truncate message and add indicator
                message = message.substring(0, 997) + '...';
            }

            // Use the correct endpoint that posts to alliance chat
            const response = await apiCall('/alliance/post-chat', 'POST', {
                alliance_id: allianceId,
                text: message
            });

            // Only log errors
            if (response?.error) {
                logger.error('[ChatBot] API returned error:', response.error);
            } else {
                // Trigger immediate chat refresh so clients see the response quickly
                // instead of waiting up to 25 seconds for next polling cycle
                triggerImmediateChatRefresh();
            }
        } catch (error) {
            logger.error('[ChatBot] Failed to send alliance message:', error);
            logger.error('[ChatBot] Error details:', error.response?.data || error.message);
        }
    }

    /**
     * Send private message
     */
    async sendPrivateMessage(userId, subject, message) {
        const { getUserId } = require('./utils/api');
        const myUserId = getUserId();

        try {
            // CRITICAL: Game API has 1000 character limit for messages
            if (message.length > 1000) {
                logger.error(`[ChatBot] ⚠️ WARNING: DM too long! ${message.length} chars (max: 1000)`);
                logger.error(`[ChatBot] Message will be truncated to avoid API error`);

                // Truncate message and add indicator
                message = message.substring(0, 997) + '...';
            }

            const response = await apiCall('/messenger/send-message', 'POST', {
                recipient: userId,
                subject: subject,
                body: message
            });

            // Trigger immediate messenger refresh so user sees the response quickly
            // instead of waiting up to 10 seconds for next polling cycle
            if (response && !response.error) {
                triggerImmediateMessengerRefresh();
            }

            return response;
        } catch (error) {
            logger.error(`[ChatBot] Failed to send private message to ${userId}:`, error);
            logger.error(`[ChatBot] Error details:`, error.response?.data || error.message);

            // Special handling for self-DM attempts
            if (userId === myUserId) {
                logger.error(`[ChatBot] Cannot send DM to yourself - game API limitation`);
                logger.log(`[ChatBot] Falling back to public response`);
                // Don't re-throw for self-DM, handle gracefully
                return null;
            }

            throw error; // Re-throw for other errors
        }
    }

    /**
     * Check if command is on cooldown
     */
    isOnCooldown(userId, command) {
        const userCooldowns = this.lastCommandTime.get(userId);
        if (!userCooldowns) return false;

        const lastTime = userCooldowns[command];
        if (!lastTime) return false;

        const cooldownMs = (this.settings.allianceCommands?.cooldownSeconds || 30) * 1000;
        return Date.now() - lastTime < cooldownMs;
    }

    /**
     * Update cooldown for command
     */
    updateCooldown(userId, command) {
        if (!this.lastCommandTime.has(userId)) {
            this.lastCommandTime.set(userId, {});
        }
        this.lastCommandTime.get(userId)[command] = Date.now();
    }

    /**
     * Validate command arguments
     * @param {string} command - Command name
     * @param {Array<string>} args - Command arguments
     * @returns {boolean} - True if arguments are valid
     */
    validateCommandArguments(command, args) {
        switch (command) {
            case 'forecast':
                return this.validateForecastArguments(args);

            case 'help':
                // Help command accepts no arguments
                return args.length === 0;

            default:
                // Custom commands or unknown commands - accept any arguments
                return true;
        }
    }

    /**
     * Validate forecast command arguments
     * Valid formats:
     * - No args (default: tomorrow)
     * - 1 arg: day (number 1-31)
     * - 2 args: day (number 1-31) + timezone (valid timezone string)
     */
    validateForecastArguments(args) {
        // No arguments is valid (default: tomorrow)
        if (args.length === 0) {
            return true;
        }

        // 1 argument: must be a valid day number (1-31)
        if (args.length === 1) {
            const day = parseInt(args[0]);
            return !isNaN(day) && day >= 1 && day <= 31;
        }

        // 2 arguments: day (1-31) + timezone
        if (args.length === 2) {
            const day = parseInt(args[0]);
            const timezone = args[1].toUpperCase();

            // Validate day
            if (isNaN(day) || day < 1 || day > 31) {
                return false;
            }

            // Validate timezone
            const validTimezones = [
                'PST', 'PDT', 'MST', 'MDT', 'CST', 'CDT', 'EST', 'EDT',
                'GMT', 'BST', 'WET', 'WEST', 'CET', 'CEST', 'EET', 'EEST',
                'JST', 'KST', 'IST',
                'AEST', 'AEDT', 'ACST', 'ACDT', 'AWST',
                'NZST', 'NZDT',
                'UTC'
            ];

            return validTimezones.includes(timezone);
        }

        // More than 2 arguments is invalid
        return false;
    }

    /**
     * Check if a command is allowed in a specific channel (alliance or DM)
     */
    isCommandAllowedInChannel(command, channel) {
        try {
            const userId = getUserId();
            if (!userId) {
                return channel === 'alliance';
            }

            const settingsPath = getSettingsFilePath(userId);
            // Read current settings to get latest values
            const data = require('fs').readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(data);

            // Build setting key based on command and channel
            // e.g., chatbotForecastAllianceEnabled or chatbotForecastDMEnabled
            const capitalizedCommand = command.charAt(0).toUpperCase() + command.slice(1);
            const channelType = channel === 'dm' ? 'DM' : 'Alliance';
            const settingKey = `chatbot${capitalizedCommand}${channelType}Enabled`;

            // Check if setting exists and return its value
            if (settingKey in settings) {
                return settings[settingKey];
            }

            // Default behavior if setting doesn't exist
            // Allow in alliance by default, block in DM by default
            return channel === 'alliance';
        } catch (error) {
            logger.error('[ChatBot] Error checking command channel permission:', error);
            // On error, allow in alliance, block in DM
            return channel === 'alliance';
        }
    }

    /**
     * Find custom command by trigger
     */
    findCustomCommand(trigger) {
        return this.settings.customCommands?.find(cmd =>
            cmd.trigger.toLowerCase() === trigger.toLowerCase()
        );
    }

    /**
     * Setup scheduled tasks
     */
    setupScheduledTasks() {
        // Clear existing tasks
        for (const timeout of this.scheduledTasks.values()) {
            clearTimeout(timeout);
        }
        this.scheduledTasks.clear();

        // Setup daily forecast
        if (this.settings.scheduledMessages?.dailyForecast?.enabled) {
            this.scheduleDailyForecast();
        }
    }

    /**
     * Schedule daily forecast message
     * Uses LOCAL server time, not UTC
     */
    scheduleDailyForecast() {
        const config = this.settings.scheduledMessages.dailyForecast;
        const [hours, minutes] = config.timeUTC.split(':').map(Number);

        const now = new Date();
        const scheduledTime = new Date();

        // Use LOCAL time instead of UTC
        scheduledTime.setHours(hours, minutes, 0, 0);

        // If time has passed today, schedule for tomorrow
        if (scheduledTime <= now) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        const msUntilScheduled = scheduledTime - now;

        // Log the scheduled time in local timezone for debugging
        logger.log(`[ChatBot] Daily forecast scheduled for: ${scheduledTime.toLocaleString('de-DE')} (in ${Math.round(msUntilScheduled / 1000 / 60)} minutes)`);

        const timeout = setTimeout(async () => {
            await this.sendDailyForecast();
            // Reschedule for next day
            this.scheduleDailyForecast();
        }, msUntilScheduled);

        this.scheduledTasks.set('dailyForecast', timeout);
    }

    /**
     * Send daily forecast message
     */
    async sendDailyForecast() {
        try {
            // Determine timezone based on current date
            const now = new Date();
            const month = now.getMonth(); // 0-11
            const isEuropeSummer = month >= 3 && month <= 9; // April to October
            const timezone = isEuropeSummer ? 'CEST' : 'CET';

            const tomorrow = now.getDate() + 1;
            const forecastText = await this.generateForecastText(tomorrow, timezone);
            await this.sendAllianceMessage(forecastText);

            // Broadcast success notification to all connected clients
            const { broadcastToUser } = require('./websocket');
            const userId = getUserId();
            if (broadcastToUser && userId) {
                logger.log('[ChatBot] ✓ Daily forecast sent successfully to alliance chat');
                broadcastToUser(userId, 'user_action_notification', {
                    type: 'success',
                    message: `📊 <strong>Daily Forecast Posted</strong><br><br>Tomorrow's forecast has been automatically posted to alliance chat at ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
                });
            }

            // Trigger immediate chat refresh so the message appears in UI
            const { triggerImmediateChatRefresh } = require('./websocket');
            if (triggerImmediateChatRefresh) {
                triggerImmediateChatRefresh();
            }
        } catch (error) {
            logger.error('[ChatBot] Failed to send daily forecast:', error);

            // Broadcast error notification
            const { broadcastToUser } = require('./websocket');
            const userId = getUserId();
            if (broadcastToUser && userId) {
                broadcastToUser(userId, 'user_action_notification', {
                    type: 'error',
                    message: `📊 <strong>Forecast Posting Failed</strong><br><br>Could not post daily forecast: ${error.message}`
                });
            }
        }
    }

    /**
     * Update settings from frontend
     * Settings are saved to per-user settings file using flat keys
     */
    async updateSettings(newSettings) {
        // Update internal state
        this.settings = { ...this.settings, ...newSettings };

        try {
            const userId = getUserId();
            if (!userId) {
                logger.error('[ChatBot] Cannot update settings: No user ID available');
                return;
            }

            // Get per-user settings file path
            const settingsPath = getSettingsFilePath(userId);

            // Read current per-user settings
            const data = await fs.readFile(settingsPath, 'utf8');
            const allSettings = JSON.parse(data);

            // Map ChatBot's nested structure to flat keys
            const flatChatBotSettings = this.mapChatBotObjectToFlatSettings(this.settings);

            // Merge flat ChatBot keys into per-user settings
            Object.assign(allSettings, flatChatBotSettings);

            // Save updated per-user settings
            await fs.writeFile(settingsPath, JSON.stringify(allSettings, null, 2), 'utf8');

            logger.log('[ChatBot] Settings updated successfully');

            // Restart scheduled tasks
            this.setupScheduledTasks();
        } catch (error) {
            logger.error('[ChatBot] Error updating settings:', error);
        }
    }
}

// Create singleton instance
const chatBot = new ChatBot();

module.exports = chatBot;