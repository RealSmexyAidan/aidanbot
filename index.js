const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection, ActivityType } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// 1. Keep-Alive Web Server for Railway
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Aidan Bot Status, Commands, and Levels are Online!'));
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
    GatewayIntentBits.MessageContent
  ] 
});

const cooldowns = new Collection();
const xpCooldowns = new Set();
const dbPath = path.join(__dirname, 'levels.json');

// Safe Database Functions
function getDb() {
  if (!fs.existsSync(dbPath)) {
    // PRE-FILLED WITH YOUR EXACT LEADERBOARD VALUES!
    const initialData = {
      "708900648741109791": { xp: 1037, level: 26 }, // Aidan's ID
      "1273551439096188988": { xp: 520, level: 20 },      // Replace with Lee's User ID
      "1145994993706729512": { xp: 249, level: 10 },    // Replace with idkXD's User ID
      "1429472238155071591": { xp: 79, level: 9 },       // Replace with BDub's User ID
      "1013255001935708200": { xp: 313, level: 8 },     // Replace with Jimmy's User ID
      "1181075917720780872": { xp: 101, level: 7 }, // Replace with Sebastian's User ID
      "810194398721605723": { xp: 92, level: 6 },     // Replace with Walter's User ID
      "1087546933679231086": { xp: 82, level: 1 },      // Replace with Fuego's User ID
      "854900667265449994": { xp: 10, level: 1 },  // Replace with Manofmike's User ID
      "705497311735840899": { xp: 14, level: 0 } // Replace with Anderdingus's User ID
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

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
  }
];

const statuses = ["Made by Aidan", "Watching Aidansville"];

// 5. Ready Event Handler
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  getDb(); // Initializes database file if it's missing
  
  // Status Cycle Setup
  let statusIndex = 0;
  client.user.setPresence({
      activities: [{ name: statuses[statusIndex], type: ActivityType.Custom }],
      status: 'online',
  });
  setInterval(() => {
      statusIndex = (statusIndex + 1) % statuses.length;
      client.user.setPresence({ activities: [{ name: statuses[statusIndex], type: ActivityType.Custom }], status: 'online' });
  }, 15000); 

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

  const db = getDb();
  const userId = message.author.id;

  if (!db[userId]) {
    db[userId] = { xp: 0, level: 0 };
  }

  // Award a random amount of XP between 15 and 25
  const xpGained = Math.floor(Math.random() * 11) + 15;
  db[userId].xp += xpGained;

  // Level formula curve (Level * 50 + 50)
  const xpNeeded = (db[userId].level * 50) + 50;

  if (db[userId].xp >= xpNeeded) {
    db[userId].xp -= xpNeeded;
    db[userId].level += 1;
    
    const newLevel = db[userId].level;

    // --- SEPARATE LEVEL UP CHANNEL LOGIC ---
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

    // --- AUTOMATIC ROLE REWARDS ---
    try {
      const member = await message.guild.members.fetch(userId);
      
      if (newLevel >= 50) {
        const role = message.guild.roles.cache.find(r => r.name === "Aidans Favorite");
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
      } else if (newLevel >= 25) {
        const role = message.guild.roles.cache.find(r => r.name === "Yap Central");
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
      } else if (newLevel >= 10) {
        const role = message.guild.roles.cache.find(r => r.name === "Chatterbox");
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
      }
    } catch (roleError) {
      console.error("Failed to assign role:", roleError);
    }
  }

  saveDb(db);

  // 5-second cooldown per user to prevent spamming for XP
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

  // --- INDIVIDUAL LEVEL COMMAND ---
  if (commandName === 'level') {
    const targetUser = interaction.options.getUser('user') || user;
    const db = getDb();
    
    // Fallback if target user isn't tracked yet
    const userData = db[targetUser.id] || { xp: 0, level: 0 };
    const xpNeeded = (userData.level * 50) + 50;

    // Calculate leaderboard position rank
    const sorted = Object.entries(db)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp);
    const rank = sorted.findIndex(p => p.id === targetUser.id) + 1 || 'Unranked';

    const lvlEmbed = new EmbedBuilder()
      .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
      .setTitle('Progress Card')
      .setDescription(`<@${targetUser.id}> is currently conquering the server tracking ranks!`)
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

  // Cooldown Setup for standard interactions
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
});

client.login(TOKEN);
