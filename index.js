const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection, ActivityType, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');

// Register the exact font filename you uploaded
GlobalFonts.registerFromPath(path.join(__dirname, 'ARIAL.TTF'), 'CustomArial');

// 1. Keep-Alive Web Server for Railway
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Aidan Bot Status, Commands, Levels, and Stats are Online!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Target Logging Channel ID for Music Logs (REPLACE THIS WITH YOUR ACTUAL CHANNEL ID)
const MUSIC_LOGS_CHANNEL_ID = '1418398569781661857';

// 2. Read Tokens / Credentials
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

// Initialize Database Connection Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Database Helper Functions
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(20) PRIMARY KEY,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      daps INTEGER DEFAULT 0
    )
  `);
  console.log('📊 Database table verified and ready.');
}

async function getUserData(userId) {
  const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  if (res.rows.length === 0) {
    const insertRes = await pool.query('INSERT INTO users (user_id, xp, level, daps) VALUES ($1, 0, 0, 0) RETURNING *', [userId]);
    return insertRes.rows[0];
  }
  return res.rows[0];
}

// 3. Create Bot Client Instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates // Required for voice connection audio tracks
  ],
  partials: [
    Partials.Message, 
    Partials.Channel, 
    Partials.Reaction 
  ]
});

// Initialize DisTube Music Player Instance
const distube = new DisTube(client, {
  leaveOnEmpty: true,
  leaveOnFinish: true, // Disconnects from the VC automatically when done
  emitNewSongOnly: true,
  plugins: [new YouTubePlugin(), new SpotifyPlugin()]
});

// --- DISTUBE MUSIC LOGGER EVENTS ---
distube.on('playSong', (queue, song) => {
  const logChannel = queue.textChannel.guild.channels.cache.get(MUSIC_LOGS_CHANNEL_ID);
  if (logChannel) {
    logChannel.send(`**Now Playing:** [${song.name}](${song.url}) | Requested by: <@${song.user.id}>`);
  }
});

distube.on('finishSong', (queue, song) => {
  const logChannel = queue.textChannel.guild.channels.cache.get(MUSIC_LOGS_CHANNEL_ID);
  if (logChannel) {
    logChannel.send(`**Finished:** "${song.name}" has finished playing.`);
  }
});

distube.on('disconnect', (queue) => {
  const logChannel = queue.textChannel.guild.channels.cache.get(MUSIC_LOGS_CHANNEL_ID);
  if (logChannel) {
    logChannel.send(`**Disconnected:** Left the Voice Channel because the queue ended or bot was stopped.`);
  }
});

const cooldowns = new Collection();
const xpCooldowns = new Set();

// 4. Global Slash Commands Array
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
  { name: 'coinflip', description: 'Flip a coin' },
  { name: 'leaderboard', description: 'Display the Aidansville Level or Dap Leaderboard' },
  {
    name: 'level',
    description: 'Check your current level and card progress',
    options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'Check another citizen\'s level', required: false }]
  },
  {
    name: 'purge',
    description: 'Bulk delete a specified number of messages',
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
    name: 'play',
    description: 'Play music from a URL in your voice channel',
    options: [
      {
        name: 'url',
        type: ApplicationCommandOptionType.String,
        description: 'The YouTube, Spotify, or direct media link to play',
        required: true
      }
    ]
  },
  { name: 'stop', description: 'Stop the music and disconnect the bot from voice' },
  { name: 'nowplaying', description: 'See information about the current track' },
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

const statuses = ["Making Some Noise"];

// 5. Ready Event Handler
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  await initDb(); 
  
  let statusIndex = 0;
  client.user.setPresence({
      activities: [{ name: statuses[statusIndex], type: ActivityType.Custom }],
      status: 'online',
  });
  setInterval(() => {
      statusIndex = (statusIndex + 1) % statuses.length;
      client.user.setPresence({ activities: [{ name: statuses[statusIndex], type: ActivityType.Custom }], status: 'online' });
  }, 15000); 

  // --- AUTOMATED SERVER STATS CHANNEL TRACKER ---
  const STATS_CHANNEL_ID = '1444216285964800093'; 
  
  const updateStats = async () => {
    try {
      const channel = await client.channels.fetch(STATS_CHANNEL_ID);
      if (channel && channel.guild) {
        const totalMembers = channel.guild.memberCount;
        await channel.setName(`👥│ ${totalMembers} citizens`);
        console.log(`📊 Updated server stats counter to: ${totalMembers} citizens`);
      }
    } catch (error) {
      console.error("Failed to update stats channel name:", error);
    }
  };

  updateStats();
  setInterval(updateStats, 720000);

  // Register Global Application Commands
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

// 6. Message Tracking System (XP and Role Unlocks)
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

// 7. Welcomer System Module
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
    const defaultRole = member.guild.roles.cache.get('1397383481465507861'); // Uses your role ID
    if (defaultRole) {
      await member.roles.add(defaultRole);
    }
  } catch (error) {
    // Left completely silent on success
  }
});

// 8. Interaction and Command Logic Handler
client.on('interactionCreate', async interaction => {
  // --- LEADERBOARD BUTTON INTERACTION PROCESSOR ---
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

  // --- MUSIC COMMAND PANEL ---
  if (commandName === 'play') {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: 'You must be in a Voice Channel to request music', ephemeral: true });
    }

    const query = interaction.options.getString('url');
    await interaction.reply({ content: `Searching and loading: \`${query}\`...`, ephemeral: true });

    try {
      await distube.play(voiceChannel, query, {
        textChannel: interaction.channel,
        member: interaction.member,
        metadata: { requestedBy: interaction.user }
      });
      await interaction.editReply(`Successfully added your request to the queue`);
    } catch (error) {
      console.error(error);
      await interaction.editReply('Failed to extract stream path. Make sure the URL is public');
    }
  }

  if (commandName === 'stop') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: 'There is nothing playing right now', ephemeral: true });

    queue.stop();
    await distube.voices.leave(interaction.guildId);
    return await interaction.reply({ content: 'Stopped playback and successfully cleared the Voice Channel session', ephemeral: true });
  }

  if (commandName === 'nowplaying') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue || !queue.songs.length) {
      return interaction.reply({ content: 'No streams are currently active', ephemeral: true });
    }

    const currentSong = queue.songs[0];
    const embed = new EmbedBuilder()
      .setTitle('Currently Playing')
      .setDescription(`**Track:** [${currentSong.name}](${currentSong.url})\n**Duration:** \`${currentSong.formattedDuration}\``)
      .addFields(
        { name: 'Source / Artist', value: currentSong.uploader.name || 'Unknown Provider', inline: true },
        { name: 'Requested By', value: `<@${currentSong.user.id}>`, inline: true }
      )
      .setThumbnail(currentSong.thumbnail)
      .setColor('#1DB954');

    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // --- MODERATION PANEL COMMAND ---
  if (commandName === 'mod') {
    if (!interaction.member.permissions.has('ModerateMembers')) {
      return await interaction.reply({ 
        content: 'You do not have permission to use moderation commands', 
        ephemeral: true 
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const LOG_CHANNEL_ID = '1396953023426727998'; 
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    let targetMember;
    try {
      targetMember = await interaction.guild.members.fetch(targetUser.id);
    } catch (err) {
      return await interaction.reply({ content: 'Could not find that user in this server.', ephemeral: true });
    }

    if (targetUser.id === interaction.user.id) {
      return await interaction.reply({ content: 'You cannot moderate yourself silly', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (subcommand === 'warn') {
      try {
        await targetUser.send(`You have been warned in **${interaction.guild.name}**\n**Reason:** ${reason}`);
      } catch (e) {
        console.log(`Could not DM user ${targetUser.tag}`);
      }

      const logEmbed = new EmbedBuilder()
        .setTitle('User Warned')
        .addFields(
          { name: 'Target', value: `<@${targetUser.id}>\nTag: \`${targetUser.tag}\`\nID: \`${targetUser.id}\``, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setColor('#2b2d31');

      if (logChannel) logChannel.send({ embeds: [logEmbed] });
      return await interaction.editReply({ content: `Successfully warned <@${targetUser.id}>.` });
    }

    if (subcommand === 'timeout') {
      const duration = interaction.options.getInteger('duration');
      
      if (!targetMember.moderatable) {
        return await interaction.editReply({ content: 'You cannot time out users that are higher than you' });
      }

      try {
        await targetUser.send(`You have been timed out in **${interaction.guild.name}** for **${duration} minutes**.\n**Reason:** ${reason}\n\n*Appeal by messaging @realsmexyaidan*`);
      } catch (e) {
        console.log(`Could not DM user ${targetUser.tag}`);
      }

      await targetMember.timeout(duration * 60 * 1000, reason);

      const logEmbed = new EmbedBuilder()
        .setTitle('User Timed Out')
        .addFields(
          { name: 'Target', value: `<@${targetUser.id}>\nTag: \`${targetUser.tag}\`\nID: \`${targetUser.id}\``, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Duration', value: `${duration} minutes`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setColor('#2b2d31');

      if (logChannel) logChannel.send({ embeds: [logEmbed] });
      return await interaction.editReply({ content: `Successfully timed out <@${targetUser.id}> for ${duration} minutes.` });
    }

    if (subcommand === 'ban') {
      if (!targetMember.bannable) {
        return await interaction.editReply({ content: 'You cannot time out users that are higher than you' });
      }

      try {
        await targetUser.send(`You have been banned from **${interaction.guild.name}**.\n**Reason:** ${reason}\n\n*Appeal by messaging @realsmexyaidan*`);
      } catch (e) {
        console.log(`Could not DM user ${targetUser.tag}`);
      }

      await targetMember.ban({ reason: reason });

      const logEmbed = new EmbedBuilder()
        .setTitle('User Banned')
        .addFields(
          { name: 'Target', value: `<@${targetUser.id}>\nTag: \`${targetUser.tag}\`\nID: \`${targetUser.id}\``, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setColor('#2b2d31');

      if (logChannel) logChannel.send({ embeds: [logEmbed] });
      return await interaction.editReply({ content: `Successfully banned ${targetUser.tag}.` });
    }
  }

  // --- PURGE COMMAND ---
  if (commandName === 'purge') {
    if (!interaction.member.permissions.has('ManageMessages')) {
      return await interaction.reply({ 
        content: 'You do not have permission to use the purge command', 
        ephemeral: true 
      });
    }

    const amount = interaction.options.getInteger('amount');
    const LOG_CHANNEL_ID = '1396953023426727998'; 
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (amount < 1 || amount > 100) {
      return await interaction.reply({ 
        content: 'Please provide an amount between 1 and 100.', 
        ephemeral: true 
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      
      const logEmbed = new EmbedBuilder()
        .setTitle('Messages Purged')
        .addFields(
          { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Amount Requested', value: `\`${amount}\``, inline: true },
          { name: 'Actual Deleted', value: `\`${deleted.size}\``, inline: true }
        )
        .setColor('#2b2d31');

      if (logChannel) logChannel.send({ embeds: [logEmbed] });

      return await interaction.editReply({ 
        content: `Successfully cleared \`${deleted.size}\` messages from this channel` 
      });
    } catch (error) {
      console.error('Error purging messages:', error);
      return await interaction.editReply({ 
        content: 'There was an error trying to purge messages in this channel (Messages older than 14 days cannot be purged)' 
      });
    }
  }

  // --- QUOTE COMMAND ---
  if (commandName === 'quote') {
    const messageId = interaction.options.getString('message_id');

    await interaction.deferReply(); 

    try {
      const targetMessage = await interaction.channel.messages.fetch(messageId);
      
      if (!targetMessage.content) {
        return await interaction.editReply({ 
          content: 'That message does not contain any text to quote' 
        });
      }

      const canvas = createCanvas(800, 400);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const avatarUrl = targetMessage.author.displayAvatarURL({ extension: 'png', size: 512 });
      const avatarImage = await loadImage(avatarUrl);
      
      ctx.drawImage(avatarImage, 0, 0, 400, 400);

      const gradient = ctx.createLinearGradient(150, 0, 400, 0);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const words = targetMessage.content.split(' ');
      const maxWidth = 350;
      const xPos = 600; 

      ctx.font = '32px "CustomArial"';
      let line = '';
      let lines = [];
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());

      let fontSize = 32;
      let lineSpacing = 42;
      let startY = 160;

      if (lines.length > 8) {
        fontSize = 14;
        lineSpacing = 18;
        startY = 60; 
      } else if (lines.length > 5) {
        fontSize = 20;
        lineSpacing = 26;
        startY = 100;
      } else if (lines.length > 3) {
        fontSize = 26;
        lineSpacing = 34;
        startY = 130;
      }

      ctx.font = `${fontSize}px "CustomArial"`;
      line = '';
      lines = [];
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());

      const maxAllowedLines = fontSize === 14 ? 14 : (fontSize === 20 ? 9 : 6);
      if (lines.length > maxAllowedLines) {
        lines = lines.slice(0, maxAllowedLines);
        lines[lines.length - 1] = lines[lines.length - 1].replace(/[\s,.-]+$/, "") + "...";
      }

      let yPos = startY;
      lines.forEach((textLine) => {
        ctx.fillText(textLine, xPos, yPos);
        yPos += lineSpacing;
      });

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
      
      const buffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(buffer, { name: `quote_${targetMessage.id}.png` });

      return await interaction.editReply({ files: [attachment] });

    } catch (error) {
      console.error('Error generating quote image:', error);
      return await interaction.editReply({ 
        content: 'Could not find that message. Make sure the ID is correct and from this channel' 
      });
    }
  }

  // --- STANDARD INTERACTION COOLDOWN ENFORCEMENT ---
  const COOLDOWN_AMOUNT = 5000; 
  if (!cooldowns.has(commandName)) cooldowns.set(commandName, new Collection());
  const now = Date.now();
  const timestamps = cooldowns.get(commandName);
  
  if (timestamps.has(user.id)) {
    const expirationTime = timestamps.get(user.id) + COOLDOWN_AMOUNT;
    if (now < expirationTime) {
      const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
      const cooldownEmbed = new EmbedBuilder()
        .setDescription(`Please wait **${timeLeft}s** before using \`/${commandName}\` again.`)
        .setColor('#2b2d31');
      return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
    }
  }
  timestamps.set(user.id, now);
  setTimeout(() => timestamps.delete(user.id), COOLDOWN_AMOUNT);

  // --- INDIVIDUAL LEVEL COMMAND ---
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

  // --- LEADERBOARD COMMAND ---
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
      new ButtonBuilder()
        .setCustomId('lb_levels')
        .setLabel('Level Leaderboard')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('lb_daps')
        .setLabel('Dap Leaderboard')
        .setStyle(ButtonStyle.Success)
    );

    return await interaction.reply({ embeds: [lbEmbed], components: [row] });
  }

  // --- COIN FLIP COMMAND ---
  if (commandName === 'coinflip') {
    const outcomes = ['Heads', 'Tails'];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    
    const coinEmbed = new EmbedBuilder()
      .setDescription(`<@${interaction.user.id}> flipped a coin and got... **${result}**`)
      .setColor('#2b2d31');

    return await interaction.reply({ embeds: [coinEmbed] });
  }

  // --- PING COMMAND ---
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

  // --- DAP UP COMMAND ---
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

  // --- SAY COMMAND ---
  if (commandName === 'say') {
    const userMessage = interaction.options.getString('message');
    await interaction.reply({ content: userMessage });
  }
});

// --- REACTION ROLE CONFIGURATION ---
const REACTION_MESSAGE_ID = '1500691229493694546'; 
const REACTION_CHANNEL_ID = '1455482928103686410'; 

const reactionRoles = {
  '📢': '1469584337895686237', 
  '🤖': '1469584568578343045',
  '\u{1F4AC}': '1456407903702351925'
};

// 9. Reaction Role Module - Give Role
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.id !== REACTION_MESSAGE_ID) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the message:', error);
      return;
    }
  }

  const roleId = reactionRoles[reaction.emoji.name];
  if (!roleId) return;

  try {
    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(roleId);
    
    if (role && !member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      console.log(`Assigned role to ${user.tag}`);
    }
  } catch (error) {
    console.error('Error adding reaction role:', error);
  }
});

// 10. Reaction Role Module - Remove Role
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.id !== REACTION_MESSAGE_ID) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the message:', error);
      return;
    }
  }

  const roleId = reactionRoles[reaction.emoji.name];
  if (!roleId) return;

  try {
    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(roleId);
    
    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      console.log(`Removed role from ${user.tag}`);
    }
  } catch (error) {
    console.error('Error removing reaction role:', error);
  }
});

client.login(TOKEN);

//© 2026 AIDAN Industries. All rights reserved. This code and its contents are the intellectual property of AIDAN Industries. Unauthorized copying, redistribution, or claiming this code as your own is prohibited. 
