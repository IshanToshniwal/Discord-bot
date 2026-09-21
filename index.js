require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const store = require('./lib/store');
const games = require('./lib/games');

// ---------------------------------------------------------------------------
// Keep-alive web server (Render + UptimeRobot)
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.status(200).send('MiniRoom bot is alive'));
app.get('/health', (_req, res) =>
  res.status(200).json({ status: 'ok', uptime: process.uptime(), ready: client?.isReady() ?? false })
);
app.listen(PORT, () => console.log(`Keep-alive server listening on port ${PORT}`));

// ---------------------------------------------------------------------------
// Discord client + command loading
// ---------------------------------------------------------------------------
// Answers by mention ("@Bot 42") work without the privileged Message Content intent,
// because Discord always delivers the content of messages that mention the bot.
// Set ANSWER_WITHOUT_PING=true (and enable Message Content Intent in the Developer
// Portal) to also accept plain messages in a channel with a running game.
const ANSWER_WITHOUT_PING = process.env.ANSWER_WITHOUT_PING === 'true';
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages];
if (ANSWER_WITHOUT_PING) intents.push(GatewayIntentBits.MessageContent);
const client = new Client({ intents });
client.commands = new Collection();

for (const dir of ['commands', 'games']) {
  const full = path.join(__dirname, dir);
  for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(full, file));
    if (cmd?.data && cmd?.execute) client.commands.set(cmd.data.name, cmd);
  }
}
console.log(`Loaded commands: ${[...client.commands.keys()].join(', ')}`);

const miniroom = require('./commands/miniroom');
store.attachClient(client);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('/miniroom', { type: 3 });
  await store.restoreFromDiscord();
  await miniroom.rediscoverRooms(client);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId === 'miniroom_create') {
      return await miniroom.createRoom(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this in a server.', flags: MessageFlags.Ephemeral });
    }
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    await cmd.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName ?? interaction.customId}:`, err);
    const payload = { content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
  }
});

client.on('messageCreate', (message) => games.handleMessage(message, client, ANSWER_WITHOUT_PING));

client.on('channelDelete', (channel) => {
  if (store.data.rooms[channel.id]) {
    delete store.data.rooms[channel.id];
    store.save();
  }
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGTERM', async () => {
  await store.backupToDiscord();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
