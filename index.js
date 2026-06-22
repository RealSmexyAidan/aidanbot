const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection } = require('discord.js');

// 1. Reads your tokens from config.json
const { TOKEN, CLIENT_ID } = require('./config.json');

// 2. Create the bot client instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers 
  ] 
});

// Create a collection to track cooldowns
const cooldowns = new Collection();

// 3. Define the commands structure
const commands = [
  {
    name: 'ping',
    description: 'Checks the latency of Aidan Bot',
  },
  {
    name: 'dap',
    description: 'Dap up a friend',
    options: [
      {
        name: 'user',
        type: ApplicationCommandOptionType.User,
        description: 'The user you want to dap up',
        required: true,
      }
    ]
  },
  {
    name: 'say',
    description: 'Make Aidan Bot say something',
    options: [
      {
        name: 'message',
        type: ApplicationCommandOptionType.String,
        description: 'The text you want the Aidan Bot to repeat',
        required: true,
      }
    ]
  }
];

// 4. Register slash commands with Discord on startup
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

// --- UPDATED WELCOMER SYSTEM (EMBED VERSION) ---
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

// 5. Handle interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // --- COOLDOWN SYSTEM START ---
  const { commandName, user } = interaction;
  const COOLDOWN_AMOUNT = 30000; 
  
  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Collection());
  }

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
  // --- COOLDOWN SYSTEM END ---

  // PING HANDLER
  if (interaction.commandName === 'ping') {
    const initialEmbed = new EmbedBuilder()
      .setDescription('Pinging Aidan Bot...')
      .setColor('#2b2d31');

    const sent = await interaction.reply({ embeds: [initialEmbed], fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;

    const finalEmbed = new EmbedBuilder()
      .setDescription(`Aidan Bot is online\n\nResponded within **${latency}ms**`)
      .setColor('#2b2d31')
      .setThumbnail(client.user.displayAvatarURL());

    await interaction.editReply({ embeds: [finalEmbed] });
  }

  // DAP HANDLER
  if (interaction.commandName === 'dap') {
    const targetUser = interaction.options.getUser('user');
    
    const dapEmbed = new EmbedBuilder()
      .setDescription(`<@${interaction.user.id}> dapped up <@${targetUser.id}>`)
      .setColor('#2b2d31')
      .setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyeHJnbWZrZm5wOXpzY2x2aWF2b3U0OWloZ2FxcThrOWhja2IzM3NsbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/zSt9sNWYqGQb6gKCak/giphy.gif');

    await interaction.reply({ embeds: [dapEmbed] });
  }

  // SAY HANDLER
  if (interaction.commandName === 'say') {
    const userMessage = interaction.options.getString('message');
    await interaction.reply({ content: userMessage });
  }
});

// 6. Log into Discord
client.login(TOKEN);