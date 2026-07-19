//                                                                      
//                                               +####* //                                                       
//                                        @. @@@@@@@@@@@@#. :* //                                                 
//                                      + @@@@  @@@@@  +@@@@@@.:         
//                                     @ #@@@@@@#*@*@@@@@@@@@@@ #        
//                                     @ #@@@@@@@  .@@@@@@@@@@@-         
//                                      # .@@@@@@@@@@@@@@@@@ #@%         
//                                        @:   -*@@@@@%=  .+@@@%       * //                                             
//                    @@                @@@@@@@@@     . @@@@@@@@ :   = @@
//                  @@.@@         @@@@*=:::..  :-+@@@@@.=@@@@@@@ % @+ @@@
//      @@@@@@@@@ @@-  +@@@@@@@@@@@.    =====-        :=#@@@@@@- ##=    .
// @@@@@:       +%#  :#              -:                                 .
// @@@@@:      ...                                   :@@@   .:          .
//     @@@@@@@@@@@@@@@@%####.        -%              .@@  @@@@@@@#.     :
//                         @@@@@@@@@@@@* # --       @@+ @@@@@=    *@@@
//                                    @@   @@@@@@      @@@: #@@@@@@@    .
//                                   @@:   %@   @@*=   @@  :  @@@@@- ++  
//                                  @@. ..=@@      @@# -@@   %=-.       .
//                                   @@@@@@          @@@         - @@@:-@
//                                                               - @@@ @@
//                                                               .:@@@ @@
//                                                              @ .@@@ @@
//                                                               @*-.:=
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

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection, ActivityType, Partials, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, 'ARIAL.TTF'), 'CustomArial');

// Web Server
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Aidan Bot Status, Commands, Levels, and Stats are Online!'));
app.listen(PORT);

let TOKEN = process.env.TOKEN, CLIENT_ID = process.env.CLIENT_ID, DATABASE_URL = process.env.DATABASE_URL;
if (!TOKEN || !CLIENT_ID || !DATABASE_URL) {
  try { 
    const config = require('./config.json'); 
    TOKEN ||= config.TOKEN; CLIENT_ID ||= config.CLIENT_ID; DATABASE_URL ||= config.DATABASE_URL; 
  } catch { console.log("ℹ️ Running via environment variables."); }
}

// Database Utilities
const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });
const initDb = () => pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(20) PRIMARY KEY, 
    xp INTEGER DEFAULT 0, 
    level INTEGER DEFAULT 0, 
    daps INTEGER DEFAULT 0,
    dap_streak INTEGER DEFAULT 0,
    last_dap_time BIGINT DEFAULT 0
  )
`);

async function getUserData(userId) {
  const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  return res.rows[0] || (await pool.query('INSERT INTO users (user_id, xp, level, daps, dap_streak, last_dap_time) VALUES ($1, 0, 0, 0, 0, 0) RETURNING *', [userId])).rows[0];
}

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});
const cooldowns = new Collection(), xpCooldowns = new Set(), statuses = ["Made by Aidan", "Watching Aidansville"];

// Application Commands Specification Map
const commands = [
  { name: 'ping', description: 'Checks the latency of Aidan Bot', integration_types: [0, 1], contexts: [0, 1, 2] },
  { name: 'leaderboard', description: 'Display the Aidansville level and daps leaderboard', integration_types: [0, 1], contexts: [0, 1, 2] },
  { name: 'say', description: 'Make Aidan Bot say something', options: [{ name: 'message', type: ApplicationCommandOptionType.String, description: 'The text to repeat', required: true }], integration_types: [0, 1], contexts: [0, 1, 2] },
  { name: 'dapup', description: 'Dap up a friend', options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'The user to dap', required: true }], integration_types: [0, 1], contexts: [0, 1, 2] },
  { name: 'level', description: 'Check your level', options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'Check another citizen\'s level', required: false }], integration_types: [0, 1], contexts: [0, 1, 2] },
  { name: 'quote', description: 'Quote a message', options: [{ name: 'message_id', type: ApplicationCommandOptionType.String, description: 'The message ID', required: true }], integration_types: [0, 1], contexts: [0, 1, 2] },
  { name: 'userinfo', description: 'Displays information about a user', options: [{ name: 'target', type: ApplicationCommandOptionType.User, description: 'The user to examine', required: false }], integration_types: [0], contexts: [0] },
  { name: 'serverinfo', description: 'Displays information about this server', integration_types: [0], contexts: [0] },
  {
    name: 'mod', description: 'Staff moderation tools', integration_types: [0], contexts: [0],
    options: [
      { name: 'purge', description: 'Delete messages', type: ApplicationCommandOptionType.Subcommand, options: [{ name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Amount (1-100)', required: true }] },
      { name: 'slowmode', description: 'Set message cooldowns in channels', type: ApplicationCommandOptionType.Subcommand, options: [{ name: 'seconds', type: ApplicationCommandOptionType.Integer, description: 'Cooldown in seconds (0 to disable)', required: true }] },
      { name: 'warn', description: 'Warn a citizen', type: ApplicationCommandOptionType.Subcommand, options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'User', required: true }, { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason', required: true }] },
      { name: 'timeout', description: 'Timeout a citizen', type: ApplicationCommandOptionType.Subcommand, options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'User', required: true }, { name: 'duration', type: ApplicationCommandOptionType.Integer, description: 'Minutes', required: true }, { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason', required: true }] },
      { name: 'ban', description: 'Ban a citizen', type: ApplicationCommandOptionType.Subcommand, options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'User', required: true }, { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason', required: true }] }
    ]
  }
];

// Ready Sequence
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  await initDb(); 
  let sIdx = 0;
  setInterval(() => { client.user.setPresence({ activities: [{ name: statuses[sIdx], type: ActivityType.Custom }], status: 'online' }); sIdx = (sIdx + 1) % statuses.length; }, 15000); 

  const updateStats = async () => {
    try {
      const chan = await client.channels.fetch('1444216285964800093');
      if (chan?.guild) await chan.setName(`👥│ ${chan.guild.memberCount} citizens`);
    } catch (e) { console.error(e); }
  };
  updateStats(); setInterval(updateStats, 720000);
  try { await new REST({ version: '10' }).setToken(TOKEN).put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (e) { console.error(e); }
});

// Chat Engine: Leveling Modules
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || xpCooldowns.has(msg.author.id)) return;
  const userData = await getUserData(msg.author.id);
  const xpGained = Math.floor(Math.random() * 11) + 15;
  let nXp = userData.xp + xpGained, nLvl = userData.level, xpNeeded = (nLvl * 50) + 50;

  if (nXp >= xpNeeded) {
    nXp -= xpNeeded; nLvl++;
    const embed = new EmbedBuilder().setDescription(`<@${msg.author.id}> is now **Level ${nLvl}**`).setColor('#2b2d31');
    const chan = msg.guild.channels.cache.get('1519015856837890088') || msg.channel;
    chan.send({ embeds: [embed] });

    try {
      const member = await msg.guild.members.fetch(msg.author.id);
      const milestones = [{ lvl: 50, id: '1505615177972846682' }, { lvl: 25, id: '1505615327873073276' }, { lvl: 10, id: '1505614729651949771' }, { lvl: 1, id: '1520015021894144130' }];
      for (const m of milestones) {
        if (nLvl >= m.lvl && !member.roles.cache.has(m.id)) { await member.roles.add(m.id); break; }
      }
    } catch (e) { console.error(e); }
  }
  await pool.query('UPDATE users SET xp = $1, level = $2 WHERE user_id = $3', [nXp, nLvl, msg.author.id]);
  xpCooldowns.add(msg.author.id); setTimeout(() => xpCooldowns.delete(msg.author.id), 5000);
});

// Welcomer System
client.on('guildMemberAdd', async m => {
  const chan = m.guild.channels.cache.get('1397011380162531348');
  if (chan) chan.send({ embeds: [new EmbedBuilder().setDescription(`<@${m.id}> has crossed the Aidan wall. Welcome to Aidansville!`).setColor('#2b2d31')] });
  try { await m.roles.add('1397383481465507861'); } catch {}
});

// Reaction Roles Configuration & Event Flow
const REACTION_MESSAGE_ID = '1500691229493694546', reactionRoles = { '📢': '1469584337895686237', '🤖': '1469584568578343045', '\u{1F4AC}': '1456407903702351925' };
async function handleReaction(react, u, add) {
  if (u.bot || react.message.id !== REACTION_MESSAGE_ID) return;
  if (react.partial) { try { await react.fetch(); } catch { return; } }
  const rId = reactionRoles[react.emoji.name]; if (!rId) return;
  try {
    const member = await react.message.guild.members.fetch(u.id);
    add ? await member.roles.add(rId) : await member.roles.remove(rId);
  } catch (e) { console.error(e); }
}
client.on('messageReactionAdd', (r, u) => handleReaction(r, u, true));
client.on('messageReactionRemove', (r, u) => handleReaction(r, u, false));

// Core Multi-Interaction System Router Module
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user } = interaction, now = Date.now(), COOLDOWN_AMOUNT = 5000;
  
  if (!cooldowns.has(commandName)) cooldowns.set(commandName, new Collection());
  const timestamps = cooldowns.get(commandName);
  if (timestamps.has(user.id)) {
    const expiry = timestamps.get(user.id) + COOLDOWN_AMOUNT;
    if (now < expiry) return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Please wait **${((expiry - now) / 1000).toFixed(1)}s** before tracking \`/${commandName}\` again.`).setColor('#2b2d31')], ephemeral: true });
  }
  timestamps.set(user.id, now); setTimeout(() => timestamps.delete(user.id), COOLDOWN_AMOUNT);

  // Mod Only Commands
  if (commandName === 'mod') {
    const sub = interaction.options.getSubcommand();
    const logChannelId = '1396953023426727998';

    if (sub === 'purge') {
      if (!interaction.member.permissions.has('ManageMessages')) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const amt = interaction.options.getInteger('amount');
      if (amt < 1 || amt > 100) return interaction.reply({ content: 'Please provide an amount between 1 and 100.', ephemeral: true });
      
      await interaction.deferReply({ ephemeral: true });
      try {
        const del = await interaction.channel.bulkDelete(amt, true);
        const log = interaction.guild.channels.cache.get(logChannelId);
        if (log) {
          log.send({ 
            embeds: [new EmbedBuilder().setTitle('Messages Purged').setColor('#2b2d31').addFields(
              { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }, { name: 'Mod', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Deleted Count', value: `\`${del.size}\``, inline: true }
            )] 
          });
        }
        return interaction.editReply(`Successfully purged ${del.size} messages.`);
      } catch { return interaction.editReply('Failed to purge messages.'); }
    }

   if (sub === 'slowmode') {
      if (!interaction.member.permissions.has('ManageChannels')) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const seconds = interaction.options.getInteger('seconds');
      if (seconds < 0 || seconds > 21600) return interaction.reply({ content: 'Please enter a valid time between 0 seconds and 6 hours.', ephemeral: true });

      try {
        await interaction.channel.setRateLimitPerUser(seconds);
        const log = interaction.guild.channels.cache.get(logChannelId);
        if (log) {
          log.send({ 
            embeds: [new EmbedBuilder().setTitle('Channel Slowmode Updated').setColor('#2b2d31').addFields(
              { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }, { name: 'Mod', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Constraint Parameter', value: `\`${seconds} seconds\``, inline: true }
            )] 
          });
        }
        return interaction.reply({ content: seconds === 0 ? 'Successfully disabled slowmode.' : `Successfully set slowmode to ${seconds} seconds.`, ephemeral: true });
      } catch (e) { console.error(e); return interaction.reply({ content: 'Failed to update slowmode.', ephemeral: true }); }
    }

    if (!interaction.member.permissions.has('ModerateMembers')) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    const target = interaction.options.getUser('user'), reason = interaction.options.getString('reason');
    let member; 
    try { member = await interaction.guild.members.fetch(target.id); } catch { return interaction.reply({ content: 'Could not find that user.', ephemeral: true }); }
    
    if (target.id === interaction.user.id) return interaction.reply({ content: 'You cannot moderate yourself.', ephemeral: true });
    if (member.roles.highest.position >= interaction.member.roles.highest.position) return interaction.reply({ content: `Cannot ${sub} someone with a role higher than or equal to yours.`, ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    let title = '';

    if (sub === 'warn') { title = 'User Warned'; try { await target.send(`Warned in **${interaction.guild.name}**\nReason: ${reason}`); } catch {} }
    if (sub === 'timeout') { 
      title = 'User Timed Out'; const d = interaction.options.getInteger('duration'); 
      if (!member.moderatable) return interaction.editReply('I cannot moderate this user (they might have a higher role than the bot).'); 
      try { await target.send(`Timed out for ${d}m.\nReason: ${reason}`); } catch {} 
      await member.timeout(d * 60 * 1000, reason); 
    }
    if (sub === 'ban') { 
      title = 'User Banned'; 
      if (!member.bannable) return interaction.editReply('I cannot ban this user (they might have a higher role than the bot).'); 
      try { await target.send(`Banned from **${interaction.guild.name}**\nReason: ${reason}`); } catch {} 
      await member.ban({ reason }); 
    }

    const log = interaction.guild.channels.cache.get(logChannelId);
    if (log) {
      log.send({ 
        embeds: [new EmbedBuilder().setTitle(title).setColor('#2b2d31').addFields(
          { name: 'Target', value: `<@${target.id}>\nID: \`${target.id}\``, inline: true }, { name: 'Mod', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Reason', value: reason }
        )] 
      });
    }
    return interaction.editReply(`Successfully ${sub === 'warn' ? 'warned' : sub === 'timeout' ? 'timed out' : 'banned'} ${target.username}.`);
  }

  // Quote Command
  if (commandName === 'quote') {
    await interaction.deferReply();
    try {
      const targetMessage = await interaction.channel.messages.fetch(interaction.options.getString('message_id'));
      if (!targetMessage.content) return interaction.editReply('Empty payload asset string.');

      const canvas = createCanvas(800, 400), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 800, 400);
      ctx.drawImage(await loadImage(targetMessage.author.displayAvatarURL({ extension: 'png', size: 512 })), 0, 0, 400, 400);

      const grad = ctx.createLinearGradient(150, 0, 400, 0); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 400, 400);

      function getQuoteLayout(c, words, maxW, startFont) {
        let fSz = startFont, spacing = fSz + 10, sY = 160, lines = [];
        while (fSz >= 14) {
          c.font = `${fSz}px "CustomArial"`; c.textAlign = 'center'; c.textBaseline = 'middle';
          let testLine = ''; lines = [];
          for (let n = 0; n < words.length; n++) {
            let testStr = testLine + words[n] + ' ';
            if (c.measureText(testStr).width > maxW && n > 0) { lines.push(testLine.trim()); testLine = words[n] + ' '; }
            else testLine = testStr;
          }
          lines.push(testLine.trim());
          if (fSz === 32) { spacing = 42; sY = 160; } else if (fSz === 26) { spacing = 34; sY = 130; } else if (fSz === 20) { spacing = 26; sY = 100; } else { spacing = 18; sY = 60; }
          if (lines.length <= (fSz === 14 ? 14 : fSz === 20 ? 9 : fSz === 26 ? 6 : 4)) break;
          fSz = fSz === 32 ? 26 : fSz === 26 ? 20 : fSz === 20 ? 14 : 0;
        }
        return { lines, fontSize: fSz, lineSpacing: spacing, startY: sY };
      }

      let layout = getQuoteLayout(ctx, targetMessage.content.split(' '), 350, 32);
      if (layout.lines.length > 14) { layout.lines = layout.lines.slice(0, 14); layout.lines[13] = layout.lines[13].replace(/[\s,.-]+$/, "") + "..."; }

      ctx.fillStyle = '#ffffff'; ctx.font = `${layout.fontSize}px "CustomArial"`;
      let y = layout.startY; layout.lines.forEach(l => { ctx.fillText(l, 600, y); y += layout.lineSpacing; });

      y += 20; ctx.fillStyle = '#aaaaaa'; ctx.font = 'italic 22px "CustomArial"'; ctx.fillText(`- ${targetMessage.author.displayName || targetMessage.author.username}`, 600, y);
      y += 26; ctx.fillStyle = '#666666'; ctx.font = '16px "CustomArial"'; ctx.fillText(`@${targetMessage.author.username}`, 600, y);
      ctx.fillStyle = '#555555'; ctx.font = 'italic 12px "CustomArial"'; ctx.textAlign = 'right'; ctx.fillText('Aidan Bot', 790, 390);

      return interaction.editReply({ files: [new AttachmentBuilder(canvas.toBuffer('image/png'), { name: `quote_${targetMessage.id}.png` })] });
    } catch { return interaction.editReply('Invalid layout reference target identifier.'); }
  }

if (commandName === 'level') {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || user;
    const uData = await getUserData(target.id);
    const reqXp = (uData.level * 50) + 50;
    
    const rank = (await pool.query('SELECT user_id FROM users ORDER BY level DESC, xp DESC')).rows.findIndex(p => p.user_id === target.id) + 1 || '??';

    const embed = new EmbedBuilder()
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ dynamic: true }) })
      .setDescription(
        `**Rank:** #${rank}\n` +
        `**Level:** ${uData.level}\n` +
        `**XP:** ${uData.xp} / ${reqXp} XP`
      )
      .setColor('#2b2d31');

    return interaction.editReply({ embeds: [embed] });
  }
  
  if (commandName === 'leaderboard') {
    const [lvlRes, dapsRes] = await Promise.all([
      pool.query('SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10'),
      pool.query('SELECT * FROM users ORDER BY daps DESC, level DESC LIMIT 10')
    ]);

    const medals = ['🥇', '🥈', '🥉'];
    
    const renderDesc = (rows, type) => rows.map((p, i) => {
      const medalOrNum = i < 3 ? medals[i] : `**${i + 1}**`;
      return type === 'level' 
        ? `${medalOrNum} <@${p.user_id}> • **Level ${p.level}** • ${p.xp}/${(p.level * 50) + 50} XP`
        : `${medalOrNum} <@${p.user_id}> • **${p.daps || 0} Daps** • Level ${p.level}`;
    }).join('\n') || 'No entry items found.';

    const makeEmbed = (type) => new EmbedBuilder()
      .setTitle(`Aidansville ${type === 'level' ? 'Level' : 'Daps'} Leaderboard`)
      .setDescription(renderDesc(type === 'level' ? lvlRes.rows : dapsRes.rows, type))
      .setColor('#2b2d31')
      .setThumbnail(interaction.guild.iconURL());

    const getRow = (active) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lb_level').setLabel('Show Levels').setStyle(ButtonStyle.Primary).setDisabled(active === 'level'),
      new ButtonBuilder().setCustomId('lb_daps').setLabel('Show Daps').setStyle(ButtonStyle.Success).setDisabled(active === 'daps')
    );

    const reply = await interaction.reply({ embeds: [makeEmbed('level')], components: [getRow('level')], fetchReply: true });
    const collector = reply.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 60000 });

    collector.on('collect', async i => {
      const view = i.customId === 'lb_level' ? 'level' : 'daps';
      await i.update({ embeds: [makeEmbed(view)], components: [getRow(view)] });
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => null);
    });
    return;
  }

  if (commandName === 'ping') {
    const sent = await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Pinging Aidan Bot...').setColor('#2b2d31')], fetchReply: true });
    return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Aidan Bot is online\n\nResponded within **${sent.createdTimestamp - interaction.createdTimestamp}ms**`).setColor('#2b2d31').setThumbnail(client.user.displayAvatarURL())] });
  }

if (commandName === 'dapup') {
    const target = interaction.options.getUser('user');
    if (target.id === interaction.user.id) return interaction.reply({ content: "You can't dap yourself up!", ephemeral: true });

    await getUserData(interaction.user.id);
    await pool.query('UPDATE users SET daps = daps + 1 WHERE user_id = $1', [interaction.user.id]);

    const TOP_DAP_ROLE_ID = '1528292630419738744';
    try {
      // 1. Fetch the absolute top leader from the DB
      const topLeaderRes = await pool.query('SELECT user_id FROM users ORDER BY daps DESC, level DESC LIMIT 1');
      
      if (topLeaderRes.rows.length > 0 && topLeaderRes.rows[0].user_id === interaction.user.id) {
        const role = await interaction.guild.roles.fetch(TOP_DAP_ROLE_ID);
        if (role) {
          await interaction.guild.members.fetch(); 
          
          const currentHolder = role.members.first();
          
          // Remove the role from the old king if it's someone else
          if (currentHolder && currentHolder.id !== interaction.user.id) {
            await currentHolder.roles.remove(role);
          }
          
          // Give it to the new king
          const member = await interaction.guild.members.fetch(interaction.user.id);
          if (!member.roles.cache.has(TOP_DAP_ROLE_ID)) {
            await member.roles.add(role);
          }
        }
      }
    } catch (e) { console.error("Error swapping Top Dap role:", e); }

    return interaction.reply({ 
      embeds: [new EmbedBuilder().setDescription(`<@${interaction.user.id}> dapped up <@${target.id}>!`).setColor('#2b2d31').setImage('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTh1OGJ0eXB4MDNiYTJ0OGN0bzlyMDRneW5vM2J4b2xlaDN6NHA1NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zSt9sNWYqGQb6gKCak/giphy.gif')] 
    });
  }

  // Identity Statistics System Commands
  if (commandName === 'userinfo') {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    
    const embed = new EmbedBuilder()
      .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL() })
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setColor('#2b2d31')
      .addFields(
        { name: 'Account ID', value: `\`${targetUser.id}\``, inline: true },
        { name: 'Created On', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`, inline: false }
      );

    if (member) {
      embed.addFields(
        { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
      );
    }
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'serverinfo') {
    const { guild } = interaction;
    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setColor('#2b2d31')
      .addFields(
        { name: 'Server Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Total Citizens', value: `**${guild.memberCount}**`, inline: true },
        { name: 'Boosts', value: `**${guild.premiumSubscriptionCount || 0}** Boosts`, inline: true },
        { name: 'Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'say') return interaction.reply({ content: interaction.options.getString('message') });
});

client.login(TOKEN);
