const { SlashCommandBuilder } = require('discord.js');
const store = require('../lib/store');
const { gateGame } = require('../lib/util');
const { renderCoin } = require('../lib/canvas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin — call it to make it count on the leaderboard')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('call').setDescription('Your call (optional)').addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
    ),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const call = interaction.options.getString('call');
    const side = Math.random() < 0.5 ? 'heads' : 'tails';
    let content = `🪙 ${interaction.user} flipped a coin → **${side.toUpperCase()}**`;
    if (call) {
      const won = call === side;
      store.recordResult(interaction.guildId, interaction.user.id, 'coinflip', won ? 'win' : 'loss');
      content += won ? ' — you called it! ✅' : ` — you called ${call}. ❌`;
    }
    await interaction.reply({ content, files: [renderCoin(side)] });
  },
};
