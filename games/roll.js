const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { gateGame } = require('../lib/util');
const { renderDice } = require('../lib/canvas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice (e.g. 2d6, d20)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('dice').setDescription('Format: NdS — e.g. 1d6, 2d6, d20 (default 1d6)')),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const raw = (interaction.options.getString('dice') || '1d6').toLowerCase().replace(/\s/g, '');
    const m = raw.match(/^(\d*)d(\d+)$/);
    if (!m) {
      return interaction.reply({ content: '❌ Use the format `NdS`, e.g. `2d6` or `d20`.', flags: MessageFlags.Ephemeral });
    }
    const n = Math.min(Math.max(Number(m[1] || 1), 1), 10);
    const sides = Math.min(Math.max(Number(m[2]), 2), 1000);
    const values = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
    const total = values.reduce((a, b) => a + b, 0);
    await interaction.reply({
      content: `🎲 ${interaction.user} rolled **${n}d${sides}** → **${total}**${n > 1 ? ` (${values.join(' + ')})` : ''}`,
      files: [renderDice(values, sides)],
    });
  },
};
