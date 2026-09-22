const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const games = require('../lib/games');
const { isAdmin } = require('../lib/util');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop the game running in this channel (game host or admin only)').setDMPermission(false),

  async execute(interaction) {
    const res = await games.stop(interaction.channelId, interaction.user.id, isAdmin(interaction.member));
    return interaction.reply({ content: res.reply, flags: res.ok ? undefined : MessageFlags.Ephemeral });
  },
};
