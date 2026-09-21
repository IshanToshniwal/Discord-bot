const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const store = require('../lib/store');
const { isAdmin } = require('../lib/util');

const TOPIC_PREFIX = 'miniroom-owner:';

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
  return Object.entries(store.data.rooms).find(
    ([, r]) => r.guildId === guildId && r.ownerId === ownerId
  );
}

function buildPanel() {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Minigame Rooms')
    .setDescription(
      [
        'Click the button below to create your own private minigame room.',
        '',
        '**Room commands:**',
        '• `/miniroom add @user` — invite someone to your room',
        '• `/miniroom remove @user` — kick someone from your room',
        '• `/miniroom close` — close your room when you are done',
        '',
        '**Games you can play inside:**',
        '`/tictactoe` `/rps` `/trivia` `/wordle` `/hangman` `/guessnumber` `/8ball` `/roll` `/coinflip` `/leaderboard`',
        'Answer any game by pinging the bot, e.g. `@Bot e`, `@Bot 42`, `@Bot rock`.',
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
    delete store.data.rooms[channelId];
    store.save();
  }

  const panel = store.data.panels[guild.id];
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
            PermissionFlagsBits.UseApplicationCommands,
          ],
        },
        {
          id: me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ],
    });

    store.data.rooms[channel.id] = { guildId: guild.id, ownerId: user.id };
    store.save();

    const welcome = new EmbedBuilder()
      .setTitle('🎲 Your minigame room is ready!')
      .setDescription(
        [
          `Owner: ${user}`,
          '',
          '• `/miniroom add @user` to invite players',
          '• `/miniroom remove @user` to remove players',
          '• `/miniroom close` to close this room',
          '',
          'Try `/tictactoe @friend`, `/trivia`, `/wordle`, `/hangman` and more!',
          'Answer games by pinging me: `@Bot e`, `@Bot 42`, `@Bot rock`.',
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

async function requireOwnedRoom(interaction) {
  const { guild, user, channel } = interaction;
  const here = store.data.rooms[channel.id];
  if (here && here.ownerId === user.id) return channel;

  const owned = findRoomByOwner(guild.id, user.id);
  if (owned) {
    const ch = guild.channels.cache.get(owned[0]);
    if (ch) return ch;
    delete store.data.rooms[owned[0]];
    store.save();
  }

  await interaction.reply({
    content: here
      ? '❌ Only the owner of this minigame room can do that.'
      : "❌ You don't own a minigame room. Create one from the panel first.",
    flags: MessageFlags.Ephemeral,
  });
  return null;
}

// Re-discover rooms from channel topics so they survive a redeploy.
async function rediscoverRooms(client) {
  let found = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const channels = await guild.channels.fetch();
      for (const ch of channels.values()) {
        if (!ch || ch.type !== ChannelType.GuildText) continue;
        const topic = ch.topic || '';
        if (topic.startsWith(TOPIC_PREFIX) && !store.data.rooms[ch.id]) {
          const ownerId = topic.slice(TOPIC_PREFIX.length).trim();
          if (/^\d{15,22}$/.test(ownerId)) {
            store.data.rooms[ch.id] = { guildId: guild.id, ownerId };
            found++;
          }
        }
      }
    } catch (err) {
      console.error(`Could not scan guild ${guild.id}:`, err.message);
    }
  }
  if (found) store.save();
  console.log(`Rediscovered ${found} room(s) from channel topics.`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('miniroom')
    .setDescription('Minigame room commands')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('[Admin] Post the minigame room panel in this channel')
        .addChannelOption((opt) =>
          opt
            .setName('category')
            .setDescription('Category where minigame rooms will be created (optional)')
            .addChannelTypes(ChannelType.GuildCategory)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('close').setDescription('Close your minigame room (room owner only)')
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a user to your minigame room')
        .addUserOption((opt) => opt.setName('user').setDescription('User to add').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a user from your minigame room')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('User to remove').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('games')
        .setDescription('[Admin] Allow minigames outside of minigame rooms')
        .addBooleanOption((opt) =>
          opt
            .setName('anywhere')
            .setDescription('true = games work in any channel, false = rooms only')
            .setRequired(true)
        )
    ),

  createRoom,
  rediscoverRooms,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: '❌ Only administrators can set up the minigame panel.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const category = interaction.options.getChannel('category');
      store.data.panels[interaction.guildId] = { categoryId: category?.id ?? null };
      store.save();
      await interaction.channel.send(buildPanel());
      return interaction.reply({
        content: `✅ Panel posted.${category ? ` Rooms will be created in **${category.name}**.` : ''}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'games') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: '❌ Only administrators can change this.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const anywhere = interaction.options.getBoolean('anywhere');
      store.guildConfig(interaction.guildId).gamesRoomsOnly = !anywhere;
      store.save();
      return interaction.reply({
        content: anywhere
          ? '✅ Minigames can now be played in **any channel**.'
          : '✅ Minigames are now restricted to **minigame rooms**.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'close') {
      const room = await requireOwnedRoom(interaction);
      if (!room) return;
      delete store.data.rooms[room.id];
      store.save();
      await interaction.reply({
        content: '🔒 Closing your room in 5 seconds…',
        flags: MessageFlags.Ephemeral,
      });
      setTimeout(() => {
        room.delete(`Minigame room closed by ${interaction.user.tag}`).catch((err) =>
          console.error('Failed to delete room:', err.message)
        );
      }, 5000);
      return;
    }

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
        UseApplicationCommands: true,
      });
      await room.send(`➕ ${target} was added to the room by ${interaction.user}.`);
      return interaction.reply({ content: `✅ Added ${target} to ${room}.`, flags: MessageFlags.Ephemeral });
    }

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
      return interaction.reply({ content: `✅ Removed ${target} from ${room}.`, flags: MessageFlags.Ephemeral });
    }
  },
};
