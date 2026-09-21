require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

// ---------------------------------------------------------------------------
// Keep-alive web server (Render + UptimeRobot)
// Render's free web service requires a bound HTTP port, and UptimeRobot pings
// this URL every few minutes so the service doesn't spin down.
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.status(200).send('MiniRoom bot is alive'));
app.get('/health', (_req, res) =>
  res.status(200).json({ status: 'ok', uptime: process.uptime(), ready: client?.isReady() ?? false })
);
app.listen(PORT, () => console.log(`Keep-alive server listening on port ${PORT}`));

// ---------------------------------------------------------------------------
// Persistent storage (simple JSON file). Render's free disk is ephemeral, so
// on redeploy the bot also re-discovers rooms from channel topics (see below).
// ---------------------------------------------------------------------------
const DATA_FILE = path.join(__dirname, 'data.json');
let data = { panels: {}, rooms: {} };
// panels: { [guildId]: { categoryId } }
// rooms:  { [channelId]: { guildId, ownerId } }

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Could not read data.json, starting fresh:', err.message);
  }
}
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Could not write data.json:', err.message);
  }
}
loadData();

const TOPIC_PREFIX = 'miniroom-owner:';

// ---------------------------------------------------------------------------
// Discord client
// ---------------------------------------------------------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function sanitizeName(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'player'
  );
}

function findRoomByOwner(guildId, ownerId) {
  return Object.entries(data.rooms).find(
    ([, r]) => r.guildId === guildId && r.ownerId === ownerId
  );
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function buildPanel() {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Minigame Rooms')
    .setDescription(
      [
        'Click the button below to create your own private minigame room.',
        '',
        '**Commands (inside your room):**',
        '• `/miniroom add @user` — invite someone to your room',
        '• `/miniroom remove @user` — kick someone from your room',
        '• `/miniroom close` — close your room when you are done',
        '',
        'Each player can own **one** room at a time.',
      ].join('\n')
    )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('miniroom_create')
      .setLabel('Create Room')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row] };
}

// Re-discover rooms from channel topics so they survive a redeploy.
async function rediscoverRooms() {
  let found = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const channels = await guild.channels.fetch();
      for (const ch of channels.values()) {
        if (!ch || ch.type !== ChannelType.GuildText) continue;
        const topic = ch.topic || '';
        if (topic.startsWith(TOPIC_PREFIX) && !data.rooms[ch.id]) {
          const ownerId = topic.slice(TOPIC_PREFIX.length).trim();
          if (/^\d{15,22}$/.test(ownerId)) {
            data.rooms[ch.id] = { guildId: guild.id, ownerId };
            found++;
          }
        }
      }
    } catch (err) {
      console.error(`Could not scan guild ${guild.id}:`, err.message);
    }
  }
  if (found) saveData();
  console.log(`Rediscovered ${found} room(s) from channel topics.`);
}

// ---------------------------------------------------------------------------
// Room creation (used by both the panel button and nothing else)
// ---------------------------------------------------------------------------
async function createRoom(interaction) {
  const { guild, member, user } = interaction;

  const existing = findRoomByOwner(guild.id, user.id);
  if (existing) {
    const [channelId] = existing;
    const ch = guild.channels.cache.get(channelId);
    if (ch) {
      return interaction.reply({
        content: `You already have a room: ${ch}. Close it with \`/miniroom close\` before creating a new one.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    delete data.rooms[channelId]; // stale entry, clean up
    saveData();
  }

  const panel = data.panels[guild.id];
  const parent = panel?.categoryId ? guild.channels.cache.get(panel.categoryId) : null;
  const channelName = `minigame-${sanitizeName(member.displayName || user.username)}`;

  const me = guild.members.me;

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parent?.id ?? null,
      topic: `${TOPIC_PREFIX}${user.id}`,
      reason: `Minigame room created by ${user.tag}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AddReactions,
          ],
        },
        {
          id: me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
          ],
        },
      ],
    });

    data.rooms[channel.id] = { guildId: guild.id, ownerId: user.id };
    saveData();

    const welcome = new EmbedBuilder()
      .setTitle('🎲 Your minigame room is ready!')
      .setDescription(
        [
          `Owner: ${user}`,
          '',
          '• `/miniroom add @user` to invite players',
          '• `/miniroom remove @user` to remove players',
          '• `/miniroom close` to close this room',
        ].join('\n')
      )
      .setColor(0x57f287);

    await channel.send({ content: `${user}`, embeds: [welcome] });

    return interaction.reply({
      content: `✅ Your room has been created: ${channel}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error('Room creation failed:', err);
    return interaction.reply({
      content:
        '❌ I could not create the room. Make sure I have **Manage Channels** and **Manage Roles** permissions (and access to the category, if one is set).',
      flags: MessageFlags.Ephemeral,
    });
  }
}

// Resolves the room the invoking user owns, or replies with an error and returns null.
async function requireOwnedRoom(interaction) {
  const { guild, user, channel } = interaction;

  // Prefer the current channel if it's a room owned by this user.
  const here = data.rooms[channel.id];
  if (here && here.ownerId === user.id) return channel;

  const owned = findRoomByOwner(guild.id, user.id);
  if (owned) {
    const ch = guild.channels.cache.get(owned[0]);
    if (ch) return ch;
    delete data.rooms[owned[0]];
    saveData();
  }

  if (here) {
    await interaction.reply({
      content: '❌ Only the owner of this minigame room can do that.',
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: "❌ You don't own a minigame room. Create one from the panel first.",
      flags: MessageFlags.Ephemeral,
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('/miniroom', { type: 3 }); // Watching
  await rediscoverRooms();
});

client.on('interactionCreate', async (interaction) => {
  try {
    // ---- Panel button ----
    if (interaction.isButton() && interaction.customId === 'miniroom_create') {
      return await createRoom(interaction);
    }

    if (!interaction.isChatInputCommand() || interaction.commandName !== 'miniroom') return;
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this in a server.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    // ---- /miniroom create (admin) ----
    if (sub === 'create') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: '❌ Only administrators can set up the minigame panel.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const category = interaction.options.getChannel('category');
      data.panels[interaction.guildId] = { categoryId: category?.id ?? null };
      saveData();

      await interaction.channel.send(buildPanel());
      return interaction.reply({
        content: `✅ Panel posted.${category ? ` Rooms will be created in **${category.name}**.` : ''}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ---- /miniroom close (owner) ----
    if (sub === 'close') {
      const room = await requireOwnedRoom(interaction);
      if (!room) return;

      delete data.rooms[room.id];
      saveData();

      await interaction.reply({
        content: '🔒 Closing your room in 5 seconds…',
        flags: MessageFlags.Ephemeral,
      });
      setTimeout(async () => {
        try {
          await room.delete(`Minigame room closed by ${interaction.user.tag}`);
        } catch (err) {
          console.error('Failed to delete room:', err.message);
        }
      }, 5000);
      return;
    }

    // ---- /miniroom add (owner) ----
    if (sub === 'add') {
      const room = await requireOwnedRoom(interaction);
      if (!room) return;
      const target = interaction.options.getUser('user');

      if (target.bot) {
        return interaction.reply({ content: '❌ You cannot add bots.', flags: MessageFlags.Ephemeral });
      }

      await room.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
        AddReactions: true,
      });
      await room.send(`➕ ${target} was added to the room by ${interaction.user}.`);
      return interaction.reply({
        content: `✅ Added ${target} to ${room}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ---- /miniroom remove (owner) ----
    if (sub === 'remove') {
      const room = await requireOwnedRoom(interaction);
      if (!room) return;
      const target = interaction.options.getUser('user');

      if (target.id === interaction.user.id) {
        return interaction.reply({
          content: '❌ You cannot remove yourself. Use `/miniroom close` instead.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await room.permissionOverwrites.delete(target.id).catch(() => null);
      await room.send(`➖ ${target} was removed from the room by ${interaction.user}.`);
      return interaction.reply({
        content: `✅ Removed ${target} from ${room}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const payload = { content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

// Clean up if a room channel gets deleted manually.
client.on('channelDelete', (channel) => {
  if (data.rooms[channel.id]) {
    delete data.rooms[channel.id];
    saveData();
  }
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

client.login(process.env.DISCORD_TOKEN);
