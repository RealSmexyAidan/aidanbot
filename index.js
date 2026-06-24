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
  fs.writeFileSync(dbPath, JSON.stringify(data,
