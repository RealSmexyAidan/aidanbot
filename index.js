// ============================================================================== 
//
//                                     =-::-====-:.-=            
//                                    ::*@@@@@@@@@#+-::-         
//                                  =:=@@%%@@@@%#@@@@@=::        
//                                  :-@@@=+@@@%=-*@@@@@+:-       
//                                 %.@@@@@@-=+=@@@@@@@@@-:       
//                                  .+@@@@@@##@@@@@@@%+%+--      
//                                  ==::+#@@@@@@@@#+-:#@+--     -
//                                    -::--:::.-*%@@@@@+--   -.-
//                  @@@               @@@@@@@    -:=@@@@@@*::   +.=@
//                @@##%@         @%*++++=====+**@@#-+@@@@@#-=@%:-@@
//     @@@@@@@@@@@%=.:+%%#####%@=...:-:--:......:--*@@@@#--=+-...:
//  @@#*=......:--:............:..::........  ................ ..:
//   @@%-:::-=**=:.........................   .=@@=-+**+-.......:
//               @@@@@@@@@#+=:--=+%@......=:.. ..+@-:*@@@@@%=....*
//                          @@@@@  @-.:-@%:.......+@+:*@@*=*#-.:+%
//                                 @:::-@@@@@-...:*@%:.=@@@%=.....
//                               @@=:::+@   @@@%=.-%@ -::---:..::.
//                               @@%@@@@      @@@@@       ::%@=:@
//                                                             .=@@=+@
//                                                            -.*@@-*@
//                                                            -.-==:=@
//                                                              --=-:
//                                                                    
//  █████╗ ██╗██████╗  █████╗ ███╗   ██╗    ██████╗  ██████╗ ████████╗
// ██╔══██╗██║██╔══██╗██╔══██╗████╗  ██║    ██╔══██╗██╔═══██╗╚══██╔══╝
// ███████║██║██║  ██║███████║██╔██╗ ██║    ██████╔╝██║   ██║   ██║   
// ██╔══██║██║██║  ██║██╔══██║██║╚██╗██║    ██╔══██╗██║   ██║   ██║   
// ██║  ██║██║██████╔╝██║  ██║██║ ╚████║    ██████╔╝╚██████╔╝   ██║   
// ╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝    ╚═════╝  ╚═════╝   ╚═╝   
//
//                © 2026 AIDAN Industries. All rights reserved.
//
// ==============================================================================


// ==========================================
// === 1. DEPENDENCIES & CONFIGURATION ===
// ==========================================
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection, ActivityType, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const musicQueues = new Map();

// Register the exact font filename
GlobalFonts.registerFromPath(path.join(__dirname, 'ARIAL.TTF'), 'CustomArial');

// Keep-Alive Web Server for Railway
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Aidan Bot Status, Commands, Levels, and Stats are Online!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Read Tokens / Credentials
let TOKEN = process.env.TOKEN;
let CLIENT_ID = process.env.CLIENT_ID;
let DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !CLIENT_ID || !DATABASE_URL) {
  try {
    const config = require('./config.json');
    if (!TOKEN) TOKEN = config.TOKEN;
    if (!CLIENT_ID) CLIENT_ID = config.CLIENT_ID;
    if (!DATABASE_URL) DATABASE_URL = config.DATABASE_URL;
  } catch (e) {
    console.log("ℹ️ Running via environment variables.");
  }
}


// ==========================================
// === 2. DATABASE UTILITIES ===
// ==========================================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(20) PRIMARY KEY,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      daps INTEGER DEFAULT 0
    )
  `);
  console.log('Database table verified and ready.');
}

async function getUserData(userId) {
  const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  if (res.rows.length === 0) {
    const insertRes = await pool.query('INSERT INTO users (user_id, xp, level, daps) VALUES ($1, 0, 0, 0) RETURNING *', [userId]);
    return insertRes.rows[0];
  }
  return res.rows[0];
}


// ==========================================
// === 3. CLIENT INITIALIZATION & PRESENCE ===
// ==========================================
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Message, 
    Partials.Channel, 
    Partials.Reaction 
  ]
});

const cooldowns = new Collection();
const xpCooldowns = new Set();
const statuses = ["Made by Aidan", "Watching Aidansville"];


// ==========================================
// === 4. GLOBAL SLASH COMMANDS ARRAY ===
// ==========================================
const commands = [
  { name: 'ping', description: 'Checks the latency of Aidan Bot' },
  {
    name: 'dapup',
    description: 'Dap up a friend',
    options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'The user you want to dap up', required: true }]
  },
  {
    name: 'say',
    description: 'Make Aidan Bot say something',
    options: [{ name: 'message', type: ApplicationCommandOptionType.String, description: 'The text you want Aidan Bot to repeat', required: true }]
  },
  { name: 'leaderboard', description: 'Display the Aidansville Level or Dap Leaderboard' },
  {
    name: 'level',
    description: 'Check your current level and progress',
    options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'Check another citizen\'s level', required: false }]
  },
  {
    name: 'play',
    description: 'Play a YouTube or Spotify link in your voice channel',
    options: [{ name: 'link', type: ApplicationCommandOptionType.String, description: 'The YouTube or Spotify URL', required: true }]
  },
  {
    name: 'stop',
    description: 'Stop the music player and make the bot leave the channel'
  },
  {
    name: 'queue',
    description: 'Display the currently playing track and upcoming songs'
  },
  {
    name: 'purge',
    description: 'Delete a specified number of messages',
    options: [
      {
        name: 'amount',
        type: ApplicationCommandOptionType.Integer,
        description: 'The number of messages to delete (1-100)',
        required: true
      }
    ]
  },
  {
    name: 'quote',
    description: 'Quote a message using its message ID',
    options: [
      {
        name: 'message_id',
        type: ApplicationCommandOptionType.String,
        description: 'The ID of the message you want to quote',
        required: true
      }
    ]
  },
  {
    name: 'mod',
    description: 'Staff moderation tools',
    options: [
      {
        name: 'warn',
        description: 'Warn a citizen',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'user', type: ApplicationCommandOptionType.User, description: 'The user to warn', required: true },
          { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the warning', required: true }
        ]
      },
      {
        name: 'timeout',
        description: 'Timeout a citizen',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'user', type: ApplicationCommandOptionType.User, description: 'The user to timeout', required: true },
          { name: 'duration', type: ApplicationCommandOptionType.Integer, description: 'Duration in minutes', required: true },
          { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the timeout', required: true }
        ]
      },
      {
        name: 'ban',
        description: 'Ban a citizen',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'user', type: ApplicationCommandOptionType.User, description: 'The user to ban', required: true },
          { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the ban', required: true }
        ]
      }
    ]
  }
];


// ==========================================
// === 5. READY EVENT HANDLER ===
// ==========================================
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  await initDb(); 
  
  // Rotating Status Sequence
  let statusIndex = 0;
  client.user.setPresence({
      activities: [{ name: statuses[statusIndex], type: ActivityType.Custom }],
      status: 'online',
  });
  setInterval(() => {
      statusIndex = (statusIndex + 1) % statuses.length;
      client.user.setPresence({ activities: [{ name: statuses[statusIndex], type: ActivityType.Custom }], status: 'online' });
  }, 15000); 

  

  // Server Stats Counter Tracker
  const STATS_CHANNEL_ID = '1444216285964800093'; 
  const updateStats = async () => {
    try {
      const channel = await client.channels.fetch(STATS_CHANNEL_ID);
      if (channel && channel.guild) {
        const totalMembers = channel.guild.memberCount;
        await channel.setName(`👥│ ${totalMembers} citizens`);
        console.log(`Updated server stats counter to: ${totalMembers} citizens`);
      }
    } catch (error) {
      console.error("Failed to update stats channel name:", error);
    }
  };
  updateStats();
  setInterval(updateStats, 720000);

  // Register Global Commands with Discord Engine
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});


// ==========================================
// === 6. CHAT XP & LEVEL TRACKING ===
// ==========================================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (xpCooldowns.has(message.author.id)) return;

  const userId = message.author.id;
  const userData = await getUserData(userId);

  const xpGained = Math.floor(Math.random() * 11) + 15;
  let newXp = userData.xp + xpGained;
  let newLevel = userData.level;
  const xpNeeded = (newLevel * 50) + 50;

  if (newXp >= xpNeeded) {
    newXp -= xpNeeded;
    newLevel += 1;
    
    const LEVEL_UP_CHANNEL_ID = '1519015856837890088'; 
    const levelChannel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID);
    const lvlUpEmbed = new EmbedBuilder()
      .setDescription(`<@${userId}> is now **Level ${newLevel}**`)
      .setColor('#2b2d31');

    if (levelChannel) {
      levelChannel.send({ embeds: [lvlUpEmbed] });
    } else {
      message.channel.send({ embeds: [lvlUpEmbed] });
    }

// Milestones Role Unlocks
    try {
      const member = await message.guild.members.fetch(userId);
      if (newLevel >= 50) {
        const role = message.guild.roles.cache.get('1505615177972846682'); 
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
      } else if (newLevel >= 25) {
        const role = message.guild.roles.cache.get('1505613327873073276'); 
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
      } else if (newLevel >= 10) {
        const role = message.guild.roles.cache.get('1505614729651949771'); 
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
      } if (newLevel >= 1) {
        const role = message.guild.roles.cache.get('1520015021894144130'); 
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
      }
    } catch (roleError) {
      console.error("Failed to assign role:", roleError);
    }
  }

  await pool.query('UPDATE users SET xp = $1, level = $2 WHERE user_id = $3', [newXp, newLevel, userId]);
  xpCooldowns.add(userId);
  setTimeout(() => xpCooldowns.delete(userId), 5000);
}); 

// ----------------------------------------
// --- [MUSIC]: AUTO-LEAVE EMPTY VC ---
// ----------------------------------------
client.on('voiceStateUpdate', (oldState, newState) => {
  // Check if the bot was connected to a channel in this server
  const serverQueue = musicQueues.get(oldState.guild.id);
  if (!serverQueue || !serverQueue.connection) return;

  const botVoiceChannel = serverQueue.voiceChannel;

  // Count how many non-bot users are left in that specific voice channel
  const humanMembers = botVoiceChannel.members.filter(member => !member.user.bot);

  // If there are 0 real users left in the channel, pack up and leave
  if (humanMembers.size === 0) {
    try {
      // Clean up server queue data memory
      musicQueues.delete(oldState.guild.id);
      
      // Send a message letting the channel know it left due to inactivity
      serverQueue.textChannel.send({
        embeds: [{
          description: '👋 **Left the voice channel** because everyone left.',
          color: 0x2b2d31
        }]
      }).catch(console.error);

      // Safely disconnect
      serverQueue.connection.destroy();
    } catch (error) {
      console.error('Error handling auto-leave:', error);
    }
  }
});

// ==========================================
// === 7. WELCOMER SYSTEM MODULE ===
// ==========================================
client.on('guildMemberAdd', async member => {
  const WELCOME_CHANNEL_ID = '1397011380162531348';
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (channel) {
    const welcomeEmbed = new EmbedBuilder()
      .setDescription(`<@${member.id}> has crossed the Aidan wall. Welcome to Aidansville!`)
      .setColor('#2b2d31');
    channel.send({ embeds: [welcomeEmbed] });
  }

  // Automatically assign the default member role on join
  try {
    const defaultRole = member.guild.roles.cache.get('1397383481465507861'); 
    if (defaultRole) await member.roles.add(defaultRole);
  } catch (error) {
    // Silent on success
  }
});

// ==========================================
// === 8. REACTION ROLE MODULES ===
// ==========================================
const REACTION_MESSAGE_ID = '1500691229493694546'; 
const REACTION_CHANNEL_ID = '1455482928103686410'; 

const reactionRoles = {
  '📢': '1469584337895686237', 
  '🤖': '1469584568578343045',
  '\u{1F4AC}': '1456407903702351925'
};

// Add Reaction Role
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot || reaction.message.id !== REACTION_MESSAGE_ID) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch (error) { return console.error(error); }
  }
  const roleId = reactionRoles[reaction.emoji.name];
  if (!roleId) return;
  try {
    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(roleId);
    if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
  } catch (error) { console.error(error); }
});

// Remove Reaction Role
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot || reaction.message.id !== REACTION_MESSAGE_ID) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch (error) { return console.error(error); }
  }
  const roleId = reactionRoles[reaction.emoji.name];
  if (!roleId) return;
  try {
    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(roleId);
    if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);
  } catch (error) { console.error(error); }
});


// ==========================================
// === 9. MAIN INTERACTION CREATE HANDLER ===
// ==========================================
client.on('interactionCreate', async interaction => {
  
  // ----------------------------------------
  // --- BUTTON ACTIONS: LEADERBOARD ---
  // ----------------------------------------
  if (interaction.isButton()) {
    if (interaction.customId === 'lb_levels' || interaction.customId === 'lb_daps') {
      const medals = ['🥇', '🥈', '🥉'];
      let description = '';
      let title = '';

      if (interaction.customId === 'lb_levels') {
        title = 'Aidansville Level Leaderboard';
        const res = await pool.query('SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10');
        res.rows.forEach((player, idx) => {
          const prefix = idx < 3 ? `${medals[idx]} ` : `**${idx + 1}** `;
          const nextLvlXp = (player.level * 50) + 50;
          description += `${prefix}<@${player.user_id}> • **Level ${player.level}** • ${player.xp}/${nextLvlXp} XP\n`;
        });
      } else {
        title = 'Aidansville Dap Leaderboard';
        const res = await pool.query('SELECT * FROM users ORDER BY daps DESC LIMIT 10');
        res.rows.forEach((player, idx) => {
          const prefix = idx < 3 ? `${medals[idx]} ` : `**${idx + 1}** `;
          description += `${prefix}<@${player.user_id}> • **${player.daps} daps** given\n`;
        });
      }

      const updatedEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || 'No data recorded yet!')
        .setColor('#2b2d31')
        .setThumbnail(interaction.guild.iconURL());

      return await interaction.update({ embeds: [updatedEmbed] });
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, user } = interaction;

  // ----------------------------------------
  // --- GLOBAL ANTI-SPAM COOLDOWN ENGINE ---
  // ----------------------------------------
  const COOLDOWN_AMOUNT = 5000; 
  if (!cooldowns.has(commandName)) cooldowns.set(commandName, new Collection());
  const now = Date.now();
  const timestamps = cooldowns.get(commandName);
  
  if (timestamps.has(user.id)) {
    const expirationTime = timestamps.get(user.id) + COOLDOWN_AMOUNT;
    if (now < expirationTime) {
      const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
      const cooldownEmbed = new EmbedBuilder().setDescription(`Please wait **${timeLeft}s** before using \`/${commandName}\` again.`).setColor('#2b2d31');
      return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
    }
  }
  timestamps.set(user.id, now);
  setTimeout(() => timestamps.delete(user.id), COOLDOWN_AMOUNT);

  // ----------------------------------------
  // --- [MODERATION]: COMMAND: MOD ---
  // ----------------------------------------
  if (commandName === 'mod') {
    if (!interaction.member.permissions.has('ModerateMembers')) {
      return await interaction.reply({ content: 'You do not have permission to use moderation commands', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const LOG_CHANNEL_ID = '1396953023426727998'; 
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    let targetMember;
    try { targetMember = await interaction.guild.members.fetch(targetUser.id); } catch (err) {
      return await interaction.reply({ content: 'Could not find that user in this server.', ephemeral: true });
    }

    if (targetUser.id === interaction.user.id) {
      return await interaction.reply({ content: 'You cannot moderate yourself silly', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (subcommand === 'warn') {
      try { await targetUser.send(`You have been warned in **${interaction.guild.name}**\n**Reason:** ${reason}`); } catch (e) {}
      const logEmbed = new EmbedBuilder().setTitle('User Warned').setColor('#2b2d31').addFields(
        { name: 'Target', value: `<@${targetUser.id}>\nTag: \`${targetUser.tag}\`\nID: \`${targetUser.id}\``, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason }
      );
      if (logChannel) logChannel.send({ embeds: [logEmbed] });
      return await interaction.editReply({ content: `Successfully warned <@${targetUser.id}>.` });
    }

    if (subcommand === 'timeout') {
      const duration = interaction.options.getInteger('duration');
      if (!targetMember.moderatable) return await interaction.editReply({ content: 'You cannot time out users that are higher than you or if the bot lacks permissions.' });
      try { await targetUser.send(`You have been timed out in **${interaction.guild.name}** for **${duration} minutes**.\n**Reason:** ${reason}\n\n*Appeal by messaging @realsmexyaidan*`); } catch (e) {}
      await targetMember.timeout(duration * 60 * 1000, reason);
      const logEmbed = new EmbedBuilder().setTitle('User Timed Out').setColor('#2b2d31').addFields(
        { name: 'Target', value: `<@${targetUser.id}>\nTag: \`${targetUser.tag}\`\nID: \`${targetUser.id}\``, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Duration', value: `${duration} minutes`, inline: true },
        { name: 'Reason', value: reason }
      );
      if (logChannel) logChannel.send({ embeds: [logEmbed] });
      return await interaction.editReply({ content: `Successfully timed out <@${targetUser.id}> for ${duration} minutes.` });
    }

    if (subcommand === 'ban') {
      if (!targetMember.bannable) return await interaction.editReply({ content: 'You cannot ban users that are higher than you or if the bot lacks permissions.' });
      try { await targetUser.send(`You have been banned from **${interaction.guild.name}**.\n**Reason:** ${reason}\n\n*Appeal by messaging @realsmexyaidan*`); } catch (e) {}
      await targetMember.ban({ reason: reason });
      const logEmbed = new EmbedBuilder().setTitle('User Banned').setColor('#2b2d31').addFields(
        { name: 'Target', value: `<@${targetUser.id}>\nTag: \`${targetUser.tag}\`\nID: \`${targetUser.id}\``, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason }
      );
      if (logChannel) logChannel.send({ embeds: [logEmbed] });
      return await interaction.editReply({ content: `Successfully banned ${targetUser.tag}.` });
    }
  }

  // ----------------------------------------
  // --- [MODERATION]: COMMAND: PURGE ---
  // ----------------------------------------
  if (commandName === 'purge') {
    if (!interaction.member.permissions.has('ManageMessages')) {
      return await interaction.reply({ content: 'You do not have permission to use the purge command', ephemeral: true });
    }
    const amount = interaction.options.getInteger('amount');
    const LOG_CHANNEL_ID = '1396953023426727998'; 
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (amount < 1 || amount > 100) return await interaction.reply({ content: 'Please provide an amount between 1 and 100.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      const logEmbed = new EmbedBuilder().setTitle('Messages Purged').setColor('#2b2d31').addFields(
        { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Amount Requested', value: `\`${amount}\``, inline: true },
        { name: 'Actual Deleted', value: `\`${deleted.size}\``, inline: true }
      );
      if (logChannel) logChannel.send({ embeds: [logEmbed] });
      return await interaction.editReply({ content: `Successfully cleared \`${deleted.size}\` messages from this channel` });
    } catch (error) {
      return await interaction.editReply({ content: 'There was an error trying to purge messages in this channel (Messages older than 14 days cannot be purged)' });
    }
  }

  // ----------------------------------------
  // --- [UTILITY]: COMMAND: QUOTE ---
  // ----------------------------------------
  if (commandName === 'quote') {
    const messageId = interaction.options.getString('message_id');
    await interaction.deferReply({ ephemeral: true });
    try {
      const targetMessage = await interaction.channel.messages.fetch(messageId);
      if (!targetMessage.content) return await interaction.editReply({ content: 'That message does not contain any text to quote.' });

      // 1. Setup Canvas Layout (800x400 landscape)
      const canvas = createCanvas(800, 400);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Load Color Avatar & Apply Smooth Gradient Mask (Never B&W)
      const avatarUrl = targetMessage.author.displayAvatarURL({ extension: 'png', size: 512 });
      const avatarImage = await loadImage(avatarUrl);
      ctx.drawImage(avatarImage, 0, 0, 400, 400);

      const gradient = ctx.createLinearGradient(150, 0, 400, 0);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 400);

      // 3. Reliable Dynamic Text Layout Function Engine
      // This system keeps the text layout state and returns the precise measurements we need.
      function getQuoteLayout(context, textWords, maxW, startFont) {
        let fontSz = startFont;
        let spacing = startFont + 10;
        let sY = 160;
        let linesArr = [];

        // Loop down sizing steps if wrapping requires compression
        while (fontSz >= 14) {
          context.font = `${fontSz}px "CustomArial"`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          
          let testLine = '';
          linesArr = [];

          for (let n = 0; n < textWords.length; n++) {
            let testString = testLine + textWords[n] + ' ';
            if (context.measureText(testString).width > maxW && n > 0) {
              linesArr.push(testLine.trim());
              testLine = textWords[n] + ' ';
            } else {
              testLine = testString;
            }
          }
          linesArr.push(testLine.trim());

          // Establish clean positioning rules base heights
          if (fontSz === 32) { spacing = 42; sY = 160; }
          else if (fontSz === 26) { spacing = 34; sY = 130; }
          else if (fontSz === 20) { spacing = 26; sY = 100; }
          else if (fontSz === 14) { spacing = 18; sY = 60; }

          const maxLimit = fontSz === 14 ? 14 : (fontSz === 20 ? 9 : (fontSz === 26 ? 6 : 4));
          if (linesArr.length <= maxLimit) break; // Fits!

          // Step down sizing configs
          if (fontSz === 32) fontSz = 26;
          else if (fontSz === 26) fontSz = 20;
          else if (fontSz === 20) fontSz = 14;
          else break;
        }
        return { lines: linesArr, fontSize: fontSz, lineSpacing: spacing, startY: sY };
      }

      const words = targetMessage.content.split(' ');
      const maxWidth = 350;
      const xPos = 600; 

      // Execute typographic measurements
      let layout = getQuoteLayout(ctx, words, maxWidth, 32);

      // Handle extreme outliers truncation configuration safeguards
      if (layout.lines.length > 14) {
        layout.lines = layout.lines.slice(0, 14);
        layout.lines[layout.lines.length - 1] = layout.lines[layout.lines.length - 1].replace(/[\s,.-]+$/, "") + "...";
      }

      // 4. Render the Quote Text Block
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${layout.fontSize}px "CustomArial"`;

      let yPos = layout.startY;
      layout.lines.forEach((textLine) => { 
        ctx.fillText(textLine, xPos, yPos); 
        yPos += layout.lineSpacing; 
      });

      // 5. Dynamic Author Layout (ANCHORED TO TEXT HEIGHT)
      // The starting point for the name is now calculated relative to the end of the text.
      yPos += 20; 
      ctx.fillStyle = '#aaaaaa'; 
      ctx.font = 'italic 22px "CustomArial"'; 
      ctx.textAlign = 'center';
      ctx.fillText(`- ${targetMessage.author.displayName || targetMessage.author.username}`, xPos, yPos);

      yPos += 26;
      ctx.fillStyle = '#666666'; 
      ctx.font = '16px "CustomArial"'; 
      ctx.textAlign = 'center';
      ctx.fillText(`@${targetMessage.author.username}`, xPos, yPos);
      
      // 6. BRAND WATERMARK (Anchored to Canvas Bottom-Right)
      ctx.fillStyle = '#555555'; // Subtle gray watermark
      ctx.font = 'italic 12px "CustomArial"'; 
      ctx.textAlign = 'right';
      ctx.fillText(`Aidan Bot`, 790, 390);

      // 7. Send the finalized asset file
      const buffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(buffer, { name: `quote_${targetMessage.id}.png` });
      return await interaction.editReply({ files: [attachment] });
    } catch (error) {
      console.error(error);
      return await interaction.editReply({ content: 'Could not find that message. Make sure the ID is correct and from this channel.' });
    }
  }
  // ----------------------------------------
  // --- [MUSIC]: COMMAND: PLAY ---
  // ----------------------------------------
  if (commandName === 'play') {
    const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
    const play = require('play-dl');

    const inputUrl = interaction.options.getString('link');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return await interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      let trackTitle = "Unknown Track";
      let streamUrl = "";

      // Validate platform and extract data
      const urlType = play.yt_validate(inputUrl);
      const isSpotify = inputUrl.includes('spotify.com');

      if (!urlType && !isSpotify) {
        return await interaction.editReply({ content: 'Please provide a valid YouTube or Spotify link.' });
      }

      if (isSpotify) {
        if (play.is_timed_out()) await play.user_data();
        const spotifyData = await play.spotify(inputUrl);
        
        if (spotifyData.type === 'track') {
          trackTitle = `${spotifyData.name} - ${spotifyData.artists.map(a => a.name).join(', ')}`;
          const searchResult = await play.search(trackTitle, { limit: 1 });
          if (!searchResult.length) {
            return await interaction.editReply({ content: 'Could not find a playable stream for this Spotify track.' });
          }
          streamUrl = searchResult[0].url;
        } else {
          return await interaction.editReply({ content: 'Playlists and albums are not supported yet, please provide a direct track link.' });
        }
      } else {
        const videoInfo = await play.video_basic_info(inputUrl);
        trackTitle = videoInfo.video_details.title || "YouTube Track";
        streamUrl = inputUrl;
      }

      // Fetch or create the server queue
      let serverQueue = musicQueues.get(interaction.guild.id);

      const song = {
        title: trackTitle,
        url: streamUrl,
        originalUrl: inputUrl
      };

      if (!serverQueue) {
        serverQueue = {
          textChannel: interaction.channel,
          voiceChannel: voiceChannel,
          connection: null,
          player: null,
          songs: []
        };

        musicQueues.set(interaction.guild.id, serverQueue);
        serverQueue.songs.push(song);

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
          });

          const player = createAudioPlayer();
          serverQueue.connection = connection;
          serverQueue.player = player;
          connection.subscribe(player);

          const playSong = async (activeSong) => {
            if (!activeSong) {
              serverQueue.connection.destroy();
              musicQueues.delete(interaction.guild.id);
              return;
            }

            const stream = await play.stream(activeSong.url, { quality: 0 });
            const resource = createAudioResource(stream.stream, { inputType: stream.type });
            
            serverQueue.player.play(resource);

            const playEmbed = new EmbedBuilder()
              .setDescription(`Now playing: **[${activeSong.title}](${activeSong.originalUrl})**`)
              .setColor('#2b2d31');
            
            serverQueue.textChannel.send({ embeds: [playEmbed] });
          };

          await playSong(serverQueue.songs[0]);

          player.on(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(serverQueue.songs[0]);
          });

          player.on('error', error => {
            console.error(`Audio Player Error: ${error.message}`);
            serverQueue.songs.shift();
            playSong(serverQueue.songs[0]);
          });

        } catch (err) {
          console.error(err);
          musicQueues.delete(interaction.guild.id);
          return await interaction.editReply({ content: 'Could not join the voice channel.' });
        }
      } else {
        serverQueue.songs.push(song);
        const queueEmbed = new EmbedBuilder()
          .setDescription(`Added to queue: **[${song.title}](${song.originalUrl})**`)
          .setColor('#2b2d31');
        return await interaction.editReply({ embeds: [queueEmbed] });
      }

      await interaction.editReply({ content: 'Connecting and loading audio stream...' });

} catch (error) {
      console.error(error);
      // This will print the exact internal error directly into your Discord chat!
      return await interaction.editReply({ content: `Error: ${error.message}\n\`\`\`${error.stack.split('\n').slice(0, 3).join('\n')}\`\`\`` });
    }
    
  // ----------------------------------------
  // --- [MUSIC]: COMMAND: STOP ---
  // ----------------------------------------
  if (commandName === 'stop') {
    const { getVoiceConnection } = require('@discordjs/voice');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return await interaction.reply({ content: 'You must be in a voice channel to stop the music.', ephemeral: true });
    }

    const connection = getVoiceConnection(interaction.guild.id);
    if (!connection) {
      return await interaction.reply({ content: 'The bot is not currently connected to any voice channels.', ephemeral: true });
    }

    musicQueues.delete(interaction.guild.id);
    connection.destroy();

    const stopEmbed = new EmbedBuilder()
      .setDescription('**Playback stopped.** Left the voice channel.')
      .setColor('#ff4757');

    return await interaction.reply({ embeds: [stopEmbed] });
  }

  // ----------------------------------------
  // --- [MUSIC]: COMMAND: QUEUE ---
  // ----------------------------------------
  if (commandName === 'queue') {
    const serverQueue = musicQueues.get(interaction.guild.id);

    if (!serverQueue || !serverQueue.songs.length) {
      return await interaction.reply({ content: 'There is nothing currently playing or queued.', ephemeral: true });
    }

    const currentTrack = serverQueue.songs[0];
    
    let queueList = "";
    if (serverQueue.songs.length > 1) {
      queueList = serverQueue.songs.slice(1, 11).map((song, index) => {
        return `**${index + 1}.** [${song.title}](${song.originalUrl})`;
      }).join('\n');
    } else {
      queueList = "_No upcoming tracks in line._";
    }

    const queueEmbed = new EmbedBuilder()
      .setTitle(`Server Music Queue`)
      .addFields(
        { name: 'Now Playing', value: `[${currentTrack.title}](${currentTrack.originalUrl})` },
        { name: 'Next Up', value: queueList }
      )
      .setColor('#2b2d31')
      .setFooter({ text: `${serverQueue.songs.length} track(s) total` });

    return await interaction.reply({ embeds: [queueEmbed] });
  }

  // ----------------------------------------
  // --- [STATS]: COMMAND: LEVEL ---
  // ----------------------------------------
  if (commandName === 'level') {
    const targetUser = interaction.options.getUser('user') || user;
    const userData = await getUserData(targetUser.id);
    const xpNeeded = (userData.level * 50) + 50;

    const allUsers = await pool.query('SELECT user_id FROM users ORDER BY level DESC, xp DESC');
    const rank = allUsers.rows.findIndex(p => p.user_id === targetUser.id) + 1 || 'Unranked';

    const lvlEmbed = new EmbedBuilder()
      .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
      .setTitle('Progress Card')
      .addFields(
        { name: 'Rank', value: `#${rank}`, inline: true },
        { name: 'Level', value: `${userData.level}`, inline: true },
        { name: 'XP Progress', value: `${userData.xp} / ${xpNeeded} XP`, inline: true }
      )
      .setColor('#2b2d31');

    return await interaction.reply({ embeds: [lvlEmbed] });
  }

  // ----------------------------------------
  // --- [STATS]: COMMAND: LEADERBOARD ---
  // ----------------------------------------
  if (commandName === 'leaderboard') {
    const res = await pool.query('SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10');
    let description = '';
    const medals = ['🥇', '🥈', '🥉'];

    res.rows.forEach((player, idx) => {
      const prefix = idx < 3 ? `${medals[idx]} ` : `**${idx + 1}** `;
      const nextLvlXp = (player.level * 50) + 50;
      description += `${prefix}<@${player.user_id}> • **Level ${player.level}** • ${player.xp}/${nextLvlXp} XP\n`;
    });

    const lbEmbed = new EmbedBuilder()
      .setTitle('Aidansville Level Leaderboard')
      .setDescription(description || 'No one has earned XP yet!')
      .setColor('#2b2d31')
      .setThumbnail(interaction.guild.iconURL());

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lb_levels').setLabel('Level Leaderboard').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lb_daps').setLabel('Dap Leaderboard').setStyle(ButtonStyle.Success)
    );

    return await interaction.reply({ embeds: [lbEmbed], components: [row] });
  }

  // ----------------------------------------
  // --- [UTILITY]: COMMAND: PING ---
  // ----------------------------------------
  if (commandName === 'ping') {
    const initialEmbed = new EmbedBuilder().setDescription('Pinging Aidan Bot...').setColor('#2b2d31');
    const sent = await interaction.reply({ embeds: [initialEmbed], fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const finalEmbed = new EmbedBuilder()
      .setDescription(`Aidan Bot is online\n\nResponded within **${latency}ms**`)
      .setColor('#2b2d31')
      .setThumbnail(client.user.displayAvatarURL());
    await interaction.editReply({ embeds: [finalEmbed] });
  }

  // ----------------------------------------
  // --- [FUN]: COMMAND: DAPUP ---
  // ----------------------------------------
  if (commandName === 'dapup') {
    const targetUser = interaction.options.getUser('user');
    const senderId = interaction.user.id;

    await getUserData(senderId);
    await pool.query('UPDATE users SET daps = daps + 1 WHERE user_id = $1', [senderId]);

    const dapEmbed = new EmbedBuilder()
      .setDescription(`<@${senderId}> dapped up <@${targetUser.id}>`)
      .setColor('#2b2d31')
      .setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyeHJnbWZrZm5wOXpzY2x2aWF2b3U0OWloZ2FxcThrOWhja2IzM3NsbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/zSt9sNWYqGQb6gKCak/giphy.gif');
    
    await interaction.reply({ embeds: [dapEmbed] });
  }

  // ----------------------------------------
  // --- [FUN]: COMMAND: SAY ---
  // ----------------------------------------
  if (commandName === 'say') {
    const userMessage = interaction.options.getString('message');
    await interaction.reply({ content: userMessage });
  }
});

client.login(TOKEN);
