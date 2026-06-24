const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection, ActivityType, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const play = require('play-dl');

// Tell play-dl exactly where to find our static audio decoder binary
play.config({ launchOptions: { ffmpegPath: require('ffmpeg-static') } });

// 1. Keep-Alive Web Server for Railway
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Aidan Bot Status, Commands, Levels, and Stats are Online!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// 2. Read Tokens / Credentials
let TOKEN, CLIENT_ID;
try {
  const config = require('./config.json');
  TOKEN = config.TOKEN;
  CLIENT_ID = config.CLIENT_ID;
} catch (e) {
  TOKEN = process.env.TOKEN;
  CLIENT_ID = process.env.CLIENT_ID;
}

// 3. Create Bot Client Instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [
    Partials.Message, 
    Partials.Channel, 
    Partials.Reaction 
  ]
});

const cooldowns = new Collection();
const xpCooldowns = new Set();
const dbPath = path.join(__dirname, 'levels.json');

// Safe Database Functions
function getDb() {
  if (!fs.existsSync(dbPath)) {
    const initialData = {
      "708900648741109791": { xp: 1037, level: 26 }, 
      "1273551439096188988": { xp: 520, level: 20 },      
      "1145994993706729512": { xp: 249, level: 10 },    
      "1429472238155071591": { xp: 79, level: 9 },       
      "1013255001935708200": { xp: 313, level: 8 },     
      "1181075917720780872": { xp: 101, level: 7 }, 
      "810194398721605723": { xp: 92, level: 6 },     
      "1087546933679231086": { xp: 82, level: 1 },      
      "854900667265449994": { xp: 10, level: 1 },  
      "705497311735840899": { xp: 14, level: 0 } 
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

// --- REACTION ROLE CONFIGURATION ---
const REACTION_MESSAGE_ID = '1500691229493694546'; 
const REACTION_CHANNEL_ID = '1455482928103686410'; 

const reactionRoles = {
  '📢': '1469584337895686237',
  '🤖': '1469584568578343045',
  '\u{1F4AC}': '1456407903702351925'
};

function saveDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

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
  { name: 'leaderboard', description: 'Display the Aidansville Level Leaderboard' },
  {
    name: 'level',
    description: 'Check your current level and card progress',
    options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'Check another member\'s level', required: false }]
  },
  {
    name: 'play',
    description: 'Make Aidan Bot join your VC and play music from a URL or YouTube link',
    options: [{ name: 'url', type: ApplicationCommandOptionType.String, description: 'The link to the video or raw file stream', required: true }]
  },
  { name: 'stop', description: 'Stops the music and makes Aidan Bot leave the voice channel' }
];

const statuses = ["Made by Aidan", "Watching Aidansville"];

// 5. Ready Event Handler
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  getDb(); 
  
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
    console.log('🔄 Force updating application commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commands synced perfectly!');
  } catch (error) {
    console.error(error);
  }
});

// 6. Message Tracking System (XP and Role Unlocks)
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (xpCooldowns.has(message.author.id)) return;

  const db = getDb();
  const userId = message.author.id;

  if (!db[userId]) {
    db[userId] = { xp: 0, level: 0 };
  }

  const xpGained = Math.floor(Math.random() * 11) + 15;
  db[userId].xp += xpGained;

  const xpNeeded = (db[userId].level * 50) + 50;

  if (db[userId].xp >= xpNeeded) {
    db[userId].xp -= xpNeeded;
    db[userId].level += 1;
    
    const newLevel = db[userId].level;

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
      }
    } catch (roleError) {
      console.error("Failed to assign role:", roleError);
    }
  }

  saveDb(db);

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
});

// 8. Interaction and Command Logic Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user } = interaction;

  // --- STANDARD INTERACTION COOLDOWN ENFORCEMENT ---
  const COOLDOWN_AMOUNT = 30000; 
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
    const db = getDb();
    
    const userData = db[targetUser.id] || { xp: 0, level: 0 };
    const xpNeeded = (userData.level * 50) + 50;

    const sorted = Object.entries(db)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp);
    const rank = sorted.findIndex(p => p.id === targetUser.id) + 1 || 'Unranked';

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
    const db = getDb();
    const sorted = Object.entries(db)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, 10);

    let description = '';
    const medals = ['🥇', '🥈', '🥉'];

    sorted.forEach((player, idx) => {
      const prefix = idx < 3 ? `${medals[idx]} ` : `**${idx + 1}** `;
      const nextLvlXp = (player.level * 50) + 50;
      description += `${prefix}<@${player.id}> • **Level ${player.level}** • ${player.xp}/${nextLvlXp} XP\n`;
    });

    const lbEmbed = new EmbedBuilder()
      .setTitle('Aidansville Leaderboard')
      .setDescription(description || 'No one has earned XP yet!')
      .setColor('#2b2d31')
      .setThumbnail(interaction.guild.iconURL());

    return await interaction.reply({ embeds: [lbEmbed] });
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
    const dapEmbed = new EmbedBuilder()
      .setDescription(`<@${interaction.user.id}> dapped up <@${targetUser.id}>`)
      .setColor('#2b2d31')
      .setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyeHJnbWZrZm5wOXpzY2x2aWF2b3U0OWloZ2FxcThrOWhja2IzM3NsbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/zSt9sNWYqGQb6gKCak/giphy.gif');
    await interaction.reply({ embeds: [dapEmbed] });
  }

  // --- SAY COMMAND ---
  if (commandName === 'say') {
    const userMessage = interaction.options.getString('message');
    await interaction.reply({ content: userMessage });
  }

  // --- PLAY MUSIC COMMAND (Optimized with direct stream parameters) ---
  if (commandName === 'play') {
    const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
    
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return await interaction.reply({ content: 'You need to be in a voice channel first!', ephemeral: true });
    }

    const url = interaction.options.getString('url');
    await interaction.deferReply();

    try {
      let stream;
      let streamType;

      if (play.yt_validate(url) === 'video') {
        const videoInfo = await play.video_info(url, { timeout: 10000 });
        stream = await play.stream_from_info(videoInfo, { quality: 0 }); 
        streamType = stream.type;
      } else {
        stream = url;
        streamType = null;
      }

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      const resource = createAudioResource(stream.stream || stream, {
        inputType: streamType || undefined
      });

      const player = createAudioPlayer();
      player.play(resource);
      connection.subscribe(player);

      if (!client.musicPlayers) client.musicPlayers = new Map();
      client.musicPlayers.set(interaction.guild.id, { connection, player });

      await interaction.editReply({ content: `🎶 Now playing your request in **${voiceChannel.name}**!` });

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
        client.musicPlayers.delete(interaction.guild.id);
      });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: 'Failed to process the YouTube video or stream link. Make sure the link is public!' });
    }
  }

  // --- STOP MUSIC COMMAND ---
  if (commandName === 'stop') {
    if (!client.musicPlayers || !client.musicPlayers.has(interaction.guild.id)) {
      return await interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
    }

    const session = client.musicPlayers.get(interaction.guild.id);
    
    try {
      session.player.stop();
      session.connection.destroy();
      client.musicPlayers.delete(interaction.guild.id);
      
      await interaction.reply({ content: '👋 Stopped the music and left the voice channel!' });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'An error occurred while trying to disconnect.', ephemeral: true });
    }
  }
});

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
