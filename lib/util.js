const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const store = require('./store');

function isAdmin(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function isRoom(channelId) {
  return Boolean(store.data.rooms[channelId]);
}

// Returns true if the game may run here; otherwise replies with an error and returns false.
async function gateGame(interaction) {
  const cfg = store.guildConfig(interaction.guildId);
  if (!cfg.gamesRoomsOnly || isRoom(interaction.channelId)) return true;
  await interaction.reply({
    content:
      '🎮 Minigames can only be played inside a **minigame room**. Create one from the panel, or ask an admin to run `/miniroom games anywhere:true`.',
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function userInfo(user, member) {
  return {
    id: user.id,
    name: member?.displayName || user.displayName || user.username,
    avatarURL: (member || user).displayAvatarURL({ extension: 'png', size: 128 }),
  };
}

// Safe reply/edit that tolerates already-replied interactions.
async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

module.exports = { isAdmin, isRoom, gateGame, pick, shuffle, userInfo, respond };
