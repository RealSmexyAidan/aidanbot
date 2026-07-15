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
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, Collection, ActivityType, Partials, AttachmentBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const play = require('play-dl');

GlobalFonts.registerFromPath(path.join(__dirname, 'ARIAL.TTF'), 'CustomArial');

// Web Server
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Aidan Bot Status, Commands, Levels, and Stats are Online!'));
app.listen(PORT);

let TOKEN = process.env.TOKEN, CLIENT_ID = process.env.CLIENT_ID, DATABASE_URL = process.env.DATABASE_URL;
if (!TOKEN || !CLIENT_ID || !DATABASE_URL) {
  try { const config = require('./config.json'); TOKEN ||= config.TOKEN; CLIENT_ID ||= config.CLIENT_ID; DATABASE_URL ||= config.DATABASE_URL; } catch { console.log("ℹ️ Running via environment variables."); }
}

// Global Music Configuration & Channel Constraints
const MAIN_VOICE_CHANNEL_ID = '1445952337100280009';
const musicQueues = new Map();

function getQueue(guildId) {
  if (!musicQueues.has(guildId)) {
    musicQueues.set(guildId, {
      connection: null,
      player: null,
      currentSong: null,
      songs: []
    });
  }
  return musicQueues.get(guildId);
}

// Core Streaming & Audio Playback Logic
async function playNext(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue || queue.songs.length === 0) {
    if (queue && queue.connection) {
      queue.connection.destroy();
      musicQueues.delete(guildId);
    }
    return;
  }

  queue.currentSong = queue.songs.shift();

  try {
    if (!queue.player) {
      queue.player = createAudioPlayer();
      queue.connection.subscribe(queue.player);

      queue.player.on(AudioPlayerStatus.Idle, () => {
        playNext(guildId);
      });

      queue.player.on('error', error => {
        console.error('Audio Player Error:', error);
        playNext(guildId);
      });
    }

    const stream = await play.stream(queue.currentSong.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    queue.player.play(resource);

  } catch (error) {
    console.error('Error starting playback:', error);
    playNext(guildId);
  }
}

// Database Utilities
const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });
async function initDb() {
  await pool.query('CREATE TABLE IF NOT EXISTS users (user_id VARCHAR(20) PRIMARY KEY, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, daps INTEGER DEFAULT 0)');
}

async function getUserData(userId) {
  const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  if (res.rows.length === 0) {
    const insertRes = await pool.query('INSERT INTO users (user_id, xp, level, daps) VALUES ($1, 0, 0, 0) RETURNING *', [userId]);
    return insertRes.rows[0];
  }
  return res.rows[0];
}

// Client Configuration
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});
const cooldowns = new Collection(), xpCooldowns = new Set(), statuses = ["Made by Aidan", "Watching Aidansville"];

// Application Commands Specification Map
const commands = [
  { name: 'ping', description: 'Checks the latency of Aidan Bot' },
  { name: 'leaderboard', description: 'Display the Aidansville level leaderboard' },
  { name: 'say', description: 'Make Aidan Bot say something', options: [{ name: 'message', type: ApplicationCommandOptionType.String, description: 'The text to repeat', required: true }] },
  { name: 'dapup', description: 'Dap up a friend', options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'The user to dap', required: true }] },
  { name: 'level', description: 'Check your level', options: [{ name: 'user', type: ApplicationCommandOptionType.User, description: 'Check another citizen\'s level', required: false }] },
  { name: 'purge', description: 'Delete messages', options: [{ name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Amount (1-100)', required: true }] },
  { name: 'quote', description: 'Quote a message', options: [{ name: 'message_id', type: ApplicationCommandOptionType.String, description: 'The message ID', required: true }] },
  { name: 'play', description: 'Play music in the main voice channel', options: [{ name: 'query', type: ApplicationCommandOptionType.String, description: 'YouTube/Spotify URL or search terms', required: true }] },
  { name: 'queue', description: 'View the currently queued tracks' },
  { name: 'stop', description: 'Stop music playback and disconnect the bot' },
  {
    name: 'mod', description: 'Staff moderation tools',
    options: [
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
    const chan = msg.guild.channels.cache.get('1519015856837890088');
    chan ? chan.send({ embeds: [embed] }) : msg.channel.send({ embeds: [embed] });

    try {
      const member = await msg.guild.members.fetch(msg.author.id);
      const milestones = [{ lvl: 50, id: '1505615177972846682' }, { lvl: 25, id: '1505613327873073276' }, { lvl: 10, id: '1505614729651949771' }, { lvl: 1, id: '1520015021894144130' }];
      for (const m of milestones) {
        if (nLvl >= m.lvl) {
          const r = msg.guild.roles.cache.get(m.id);
          if (r && !member.roles.cache.has(r.id)) { await member.roles.add(r); break; }
        }
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
  try { const r = m.guild.roles.cache.get('1397383481465507861'); if (r) await m.roles.add(r); } catch {}
});

// Reaction Roles Configuration & Event Flow
const REACTION_MESSAGE_ID = '1500691229493694546', reactionRoles = { '📢': '1469584337895686237', '🤖': '1469584568578343045', '\u{1F4AC}': '1456407903702351925' };
async function handleReaction(react, u, add) {
  if (u.bot || react.message.id !== REACTION_MESSAGE_ID) return;
  if (react.partial) { try { await react.fetch(); } catch { return; } }
  const rId = reactionRoles[react.emoji.name]; if (!rId) return;
  try {
    const member = await react.message.guild.members.fetch(u.id), role = react.message.guild.roles.cache.get(rId);
    if (role) add ? await member.roles.add(role) : await member.roles.remove(role);
  } catch (e) { console.error(e); }
}
client.on('messageReactionAdd', (r, u) => handleReaction(r, u, true));
client.on('messageReactionRemove', (r, u) => handleReaction(r, u, false));

// Core Multi-Interaction System Router Module
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, guildId } = interaction, now = Date.now(), COOLDOWN_AMOUNT = 5000;
  
  if (!cooldowns.has(commandName)) cooldowns.set(commandName, new Collection());
  const timestamps = cooldowns.get(commandName);
  if (timestamps.has(user.id)) {
    const expiry = timestamps.get(user.id) + COOLDOWN_AMOUNT;
    if (now < expiry) return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Please wait **${((expiry - now) / 1000).toFixed(1)}s** before tracking \`/${commandName}\` again.`).setColor('#2b2d31')], ephemeral: true });
  }
  timestamps.set(user.id, now); setTimeout(() => timestamps.delete(user.id), COOLDOWN_AMOUNT);

  // Mod Only Commands
  if (commandName === 'mod') {
    if (!interaction.member.permissions.has('ModerateMembers')) return interaction.reply({ content: 'Lacking standard permission thresholds.', ephemeral: true });
    const sub = interaction.options.getSubcommand(), target = interaction.options.getUser('user'), reason = interaction.options.getString('reason');
    let member; try { member = await interaction.guild.members.fetch(target.id); } catch { return interaction.reply({ content: 'Invalid target.', ephemeral: true }); }
    if (target.id === interaction.user.id) return interaction.reply({ content: 'You cannot moderate yourself.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    let title = '';
    if (sub === 'warn') { title = 'User Warned'; try { await target.send(`Warned in **${interaction.guild.name}**\nReason: ${reason}`); } catch {} }
    if (sub === 'timeout') { title = 'User Timed Out'; const d = interaction.options.getInteger('duration'); if (!member.moderatable) return interaction.editReply('Unmoderatable user.'); try { await target.send(`Timed out for ${d}m.\nReason: ${reason}`); } catch {} await member.timeout(d * 60 * 1000, reason); }
    if (sub === 'ban') { title = 'User Banned'; if (!member.bannable) return interaction.editReply('Unbannable user.'); try { await target.send(`Banned.\nReason: ${reason}`); } catch {} await member.ban({ reason }); }

    const log = interaction.guild.channels.cache.get('1396953023426727998');
    if (log) log.send({ embeds: [new EmbedBuilder().setTitle(title).setColor('#2b2d31').addFields({ name: 'Target', value: `<@${target.id}>\nID: \`${target.id}\``, inline: true }, { name: 'Mod', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Reason', value: reason })] });
    return interaction.editReply(`Successfully executed ${sub} action on target player structure.`);
  }

  if (commandName === 'purge') {
    if (!interaction.member.permissions.has('ManageMessages')) return interaction.reply({ content: 'Lacking standard clearance configuration rules.', ephemeral: true });
    const amt = interaction.options.getInteger('amount'); if (amt < 1 || amt > 100) return interaction.reply({ content: 'Bound range parameter error.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const del = await interaction.channel.bulkDelete(amt, true);
      const log = interaction.guild.channels.cache.get('1396953023426727998');
      if (log) log.send({ embeds: [new EmbedBuilder().setTitle('Messages Purged').setColor('#2b2d31').addFields({ name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }, { name: 'Mod', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Deleted Count', value: `\`${del.size}\``, inline: true })] });
      return interaction.editReply(`Cleared \`${del.size}\` entries.`);
    } catch { return interaction.editReply('Purge operational runtime failure.'); }
  }

  // Commands
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
    const target = interaction.options.getUser('user') || user, uData = await getUserData(target.id), reqXp = (uData.level * 50) + 50;
    const rank = (await pool.query('SELECT user_id FROM users ORDER BY level DESC, xp DESC')).rows.findIndex(p => p.user_id === target.id) + 1 || 'Unranked';
    return interaction.reply({ embeds: [new EmbedBuilder().setAuthor({ name: target.username, iconURL: target.displayAvatarURL() }).addFields({ name: 'Rank', value: `#${rank}`, inline: true }, { name: 'Level', value: `${uData.level}`, inline: true }, { name: 'XP Progress', value: `${uData.xp} / ${reqXp} XP`, inline: true }).setColor('#2b2d31')] });
  }

  if (commandName === 'leaderboard') {
    const res = await pool.query('SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10');
    const medals = ['🥇', '🥈', '🥉'];
    let desc = res.rows.map((p, i) => `${i < 3 ? medals[i] : `**${i + 1}**`} <@${p.user_id}> • **Level ${p.level}** • ${p.xp}/${(p.level * 50) + 50} XP`).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Aidansville Level Leaderboard').setDescription(desc || 'No entry items found.').setColor('#2b2d31').setThumbnail(interaction.guild.iconURL())] });
  }

  if (commandName === 'ping') {
    const sent = await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Pinging Aidan Bot...').setColor('#2b2d31')], fetchReply: true });
    return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Aidan Bot is online\n\nResponded within **${sent.createdTimestamp - interaction.createdTimestamp}ms**`).setColor('#2b2d31').setThumbnail(client.user.displayAvatarURL())] });
  }

  if (commandName === 'dapup') {
    const target = interaction.options.getUser('user');
    await getUserData(interaction.user.id);
    await pool.query('UPDATE users SET daps = daps + 1 WHERE user_id = $1', [interaction.user.id]);
    return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`<@${interaction.user.id}> dapped up <@${target.id}>`).setColor('#2b2d31').setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyeHJnbWZrZm5wOXpzY2x2aWF2b3U0OWloZ2FxcThrOWhja2IzM3NsbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/zSt9sNWYqGQb6gKCak/giphy.gif')] });
  }

  if (commandName === 'say') return interaction.reply({ content: interaction.options.getString('message') });

  // ================= MUSIC COMMAND LOGIC =================

  if (commandName === 'play') {
    const voiceChannel = interaction.member.voice.channel;
    
    if (!voiceChannel) {
      return interaction.reply({ content: 'You must join a Voice Channel to play music.', ephemeral: true });
    }

    if (voiceChannel.id !== MAIN_VOICE_CHANNEL_ID) {
      return interaction.reply({ content: `Aidan Bot is restricted to joining <#${MAIN_VOICE_CHANNEL_ID}> only.`, ephemeral: true });
    }

    const queue = getQueue(guildId);

    const currentActiveSongsCount = queue.songs.length + (queue.currentSong ? 1 : 0);
    if (currentActiveSongsCount >= 10) {
      return interaction.reply({ content: 'The playback stream queue is full (**Max 10 tracks**). Wait for tracks to play out.', ephemeral: true });
    }

    await interaction.deferReply();
    const query = interaction.options.getString('query');

    try {
      let songUrl = null;
      let songTitle = 'Unknown Track';
      let durationSec = 0;

      if (play.yt_validate(query) === 'video') {
        const info = await play.video_info(query);
        songUrl = info.video_details.url;
        songTitle = info.video_details.title;
        durationSec = info.video_details.durationInSec;
      } else {
        // Search YouTube
        const searchResult = await play.search(query, { limit: 1 });
        if (!searchResult.length) return interaction.editReply('No matching tracks discovered.');
        songUrl = searchResult[0].url;
        songTitle = searchResult[0].title;
        durationSec = searchResult[0].durationInSec;
      }

      if (durationSec > 900) {
        return interaction.editReply('This track exceeds the 15-minute runtime threshold limit.');
      }

      const song = { title: songTitle, url: songUrl, requestedBy: interaction.user.id };

      if (!queue.connection) {
        queue.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
      }

      if (queue.currentSong) {
        queue.songs.push(song);
        return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Added **${song.title}** to the queue.`).setColor('#2b2d31')] });
      } else {
        queue.songs.push(song);
        await playNext(guildId);
        return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Now playing: **${song.title}**`).setColor('#2b2d31')] });
      }

    } catch (e) {
      console.error(e);
      return interaction.editReply('Streaming service query resolution failure. Ensure URLs are valid.');
    }
  }

  if (commandName === 'queue') {
    const queue = musicQueues.get(guildId);
    if (!queue || (!queue.currentSong && queue.songs.length === 0)) {
      return interaction.reply({ content: 'The playback queue is currently empty.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('Aidansville Playback Queue')
      .setColor('#2b2d31');

    let desc = `**Now Playing:**\n🎶 ${queue.currentSong.title} (Requested by <@${queue.currentSong.requestedBy}>)\n\n`;

    if (queue.songs.length > 0) {
      desc += `**Up Next:**\n`;
      queue.songs.forEach((song, idx) => {
        desc += `\`${idx + 1}.\` ${song.title} (Requested by <@${song.requestedBy}>)\n`;
      });
    } else {
      desc += '*No upcoming songs in the queue.*';
    }

    embed.setDescription(desc);
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'stop') {
    const queue = musicQueues.get(guildId);
    const voiceChannel = interaction.member.voice.channel;

    if (!queue || !queue.connection) {
      return interaction.reply({ content: 'I am not currently connected to a Voice Channel.', ephemeral: true });
    }
    
    if (!voiceChannel || voiceChannel.id !== queue.connection.joinConfig.channelId) {
      return interaction.reply({ content: 'You must be in the bot\'s voice channel to stop playback.', ephemeral: true });
    }

    if (queue.player) queue.player.stop();
    if (queue.connection) queue.connection.destroy();
    musicQueues.delete(guildId);

    return interaction.reply({ embeds: [new EmbedBuilder().setDescription('Playback terminated. Disconnecting from Voice Channel.').setColor('#2b2d31')] });
  }
});

// Auto-disconnect when the voice channel becomes empty of humans
client.on('voiceStateUpdate', (oldState, newState) => {
  const queue = musicQueues.get(oldState.guild.id);
  if (!queue || !queue.connection) return;

  const botChannelId = queue.connection.joinConfig.channelId;
  const channel = oldState.guild.channels.cache.get(botChannelId);

  if (channel) {
    const humanMembers = channel.members.filter(member => !member.user.bot);

    if (humanMembers.size === 0) {
      if (queue.player) queue.player.stop();
      if (queue.connection) queue.connection.destroy();
      musicQueues.delete(oldState.guild.id);
      console.log(`Leaving empty voice channel: ${channel.name}`);
    }
  }
});

client.login(TOKEN);
