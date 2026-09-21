// Simple JSON store with optional backup to a Discord channel.
//
// Render's free tier wipes the disk on every deploy, so data.json alone would
// lose the leaderboard. If DATA_CHANNEL_ID is set, the bot uploads data.json to
// that (private) channel whenever data changes and restores it on startup.
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

const data = {
  panels: {}, // { [guildId]: { categoryId } }
  rooms: {}, // { [channelId]: { guildId, ownerId } }
  config: {}, // { [guildId]: { gamesRoomsOnly } }
  stats: {}, // { [guildId]: { [userId]: { wins, losses, games, byGame: { [game]: { wins, losses, games } } } } }
  wordle: {}, // { [guildId]: { [date]: { [userId]: { guesses: [], done, won } } } }
};

let client = null;
let saveTimer = null;

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      Object.assign(data, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    }
  } catch (err) {
    console.error('Could not read data.json, starting fresh:', err.message);
  }
}

function writeFile() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Could not write data.json:', err.message);
  }
}

async function backupToDiscord() {
  const channelId = process.env.DATA_CHANNEL_ID;
  if (!channelId || !client?.isReady()) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    const file = new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'data.json' });
    await channel.send({ content: `📦 Backup ${new Date().toISOString()}`, files: [file] });
    // Keep the channel tidy: delete older backups (keep last 3).
    const msgs = await channel.messages.fetch({ limit: 20 });
    const mine = [...msgs.values()]
      .filter((m) => m.author.id === client.user.id && m.attachments.size)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const old of mine.slice(3)) await old.delete().catch(() => null);
  } catch (err) {
    console.error('Backup to Discord failed:', err.message);
  }
}

async function restoreFromDiscord() {
  const channelId = process.env.DATA_CHANNEL_ID;
  if (!channelId || !client?.isReady()) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    const msgs = await channel.messages.fetch({ limit: 20 });
    const latest = [...msgs.values()]
      .filter((m) => m.author.id === client.user.id && m.attachments.size)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
    if (!latest) return;
    const url = latest.attachments.first().url;
    const res = await fetch(url);
    const remote = await res.json();
    // Remote backup wins over the (probably fresh) local file.
    Object.assign(data, remote);
    writeFile();
    console.log('Restored data from Discord backup.');
  } catch (err) {
    console.error('Restore from Discord failed:', err.message);
  }
}

// Debounced save: writes immediately to disk, backs up to Discord after 20s of quiet.
function save() {
  writeFile();
  if (!process.env.DATA_CHANNEL_ID) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(backupToDiscord, 20_000);
}

function attachClient(c) {
  client = c;
}

// ---- Stats helpers ----
function statsFor(guildId, userId) {
  data.stats[guildId] ??= {};
  data.stats[guildId][userId] ??= { wins: 0, losses: 0, games: 0, byGame: {} };
  return data.stats[guildId][userId];
}

function recordResult(guildId, userId, game, result /* 'win' | 'loss' | 'draw' */) {
  const s = statsFor(guildId, userId);
  s.byGame[game] ??= { wins: 0, losses: 0, games: 0 };
  s.games++;
  s.byGame[game].games++;
  if (result === 'win') {
    s.wins++;
    s.byGame[game].wins++;
  } else if (result === 'loss') {
    s.losses++;
    s.byGame[game].losses++;
  }
  save();
}

function guildConfig(guildId) {
  data.config[guildId] ??= { gamesRoomsOnly: true };
  return data.config[guildId];
}

load();

module.exports = {
  data,
  save,
  attachClient,
  backupToDiscord,
  restoreFromDiscord,
  statsFor,
  recordResult,
  guildConfig,
};
