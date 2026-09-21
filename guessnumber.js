const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const store = require('../lib/store');
const { gateGame } = require('../lib/util');
const { renderCard, C } = require('../lib/canvas');

function row(disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gn_guess').setLabel('Make a guess').setEmoji('🔢').setStyle(ButtonStyle.Primary).setDisabled(disabled)
    ),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guessnumber')
    .setDescription("Guess the secret number — first to get it wins")
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('max').setDescription('Highest possible number (default 100)').setMinValue(10).setMaxValue(10000)),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const max = interaction.options.getInteger('max') ?? 100;
    const secret = 1 + Math.floor(Math.random() * max);
    const attempts = new Map(); // userId -> count
    const log = [];
    let lo = 1;
    let hi = max;

    const content = () =>
      `🔢 **Guess the number** between **${lo}** and **${hi}**\n` +
      (log.length ? log.slice(-6).join('\n') : 'No guesses yet.');

    await interaction.reply({ content: content(), components: row() });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 10 * 60_000 });

    collector.on('collect', async (btn) => {
      const modal = new ModalBuilder()
        .setCustomId(`gn_modal_${btn.id}`)
        .setTitle(`Guess a number (${lo}–${hi})`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('n').setLabel('Your guess').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6)
          )
        );
      await btn.showModal(modal);

      let sub;
      try {
        sub = await btn.awaitModalSubmit({ time: 60_000, filter: (m) => m.customId === `gn_modal_${btn.id}` });
      } catch {
        return;
      }
      if (collector.ended) return sub.reply({ content: 'This game already ended.', flags: MessageFlags.Ephemeral });

      const n = Number.parseInt(sub.fields.getTextInputValue('n'), 10);
      if (!Number.isInteger(n) || n < 1 || n > max) {
        return sub.reply({ content: `❌ Enter a whole number between 1 and ${max}.`, flags: MessageFlags.Ephemeral });
      }
      const name = sub.member?.displayName || sub.user.username;
      attempts.set(sub.user.id, (attempts.get(sub.user.id) || 0) + 1);

      if (n === secret) {
        collector.stop('done');
        for (const uid of attempts.keys()) {
          store.recordResult(interaction.guildId, uid, 'guessnumber', uid === sub.user.id ? 'win' : 'loss');
        }
        await sub.deferUpdate();
        return msg.edit({
          content: '',
          attachments: [], files: [
            renderCard({
              title: `${name} got it!`,
              subtitle: `The number was ${secret}`,
              body: `Solved in ${attempts.get(sub.user.id)} guess(es). ${attempts.size} player(s) took part.`,
              accent: C.green,
            }),
          ],
          components: row(true),
        });
      }

      if (n < secret) {
        lo = Math.max(lo, n + 1);
        log.push(`⬆️ **${name}** guessed ${n} — higher!`);
      } else {
        hi = Math.min(hi, n - 1);
        log.push(`⬇️ **${name}** guessed ${n} — lower!`);
      }
      await sub.deferUpdate();
      await msg.edit({ content: content() }).catch(() => null);
    });

    collector.on('end', (_c, reason) => {
      if (reason !== 'done') {
        msg.edit({ content: `⌛ Game timed out. The number was **${secret}**.`, components: row(true) }).catch(() => null);
      }
    });
  },
};
