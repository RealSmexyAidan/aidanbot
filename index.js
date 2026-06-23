const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection, ActivityType } = require('discord.js');
const express = require('express');

// 1. Keep-Alive Web Server for Railway
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Aidan Bot Status and Commands are Online!'));
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
  {
    name: 'coinflip',
    description: 'Flip a coin!'
  }
];

const statuses = ["Made by Aidan", "Watching Aidansville"];

// 5. Ready Event Handler
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  
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

// 6. Welcomer System Module
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

// 7. Interaction and Command Logic Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user } = interaction;

  // --- COIN FLIP COMMAND ---
  if (commandName === 'coinflip') {
    const outcomes = ['Heads 🪙', 'Tails 🪙'];
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

  // --- DAP COMMAND ---
  if (commandName === 'dap') {
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
