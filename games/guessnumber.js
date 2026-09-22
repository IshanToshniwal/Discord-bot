const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const games = require('../lib/games');
const { gateGame } = require('../lib/util');
const { renderRange } = require('../lib/canvas');

const row = (disabled = false) => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gn_guess').setLabel('Make a guess').setEmoji('🔢').setStyle(ButtonStyle.Primary).setDisabled(disabled)
  ),
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guessnumber')
    .setDescription('Guess the secret number — first to get it wins')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('max').setDescription('Highest possible number (default 100)').setMinValue(10).setMaxValue(10000)),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const max = interaction.options.getInteger('max') ?? 100;
    const secret = 1 + Math.floor(Math.random() * max);
    const attempts = new Map(); // userId -> count
    const history = [];
    const log = [];
    const botName = interaction.client.user.username;
    let lo = 1;
    let hi = max;
    let done = false;

    const content = () =>
      `🔢 **Guess the number** between **${lo}** and **${hi}** — say \`@${botName} 42\` or use the button.\n${log.slice(-5).join('\n') || 'No guesses yet.'}`;

    await interaction.reply({ content: content(), files: [renderRange({ lo, hi, max, guesses: history })], components: row() });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 15 * 60_000 });

    // Shared guess logic. Returns { ok, reply?, react?, payload }.
    function guess(userId, name, n) {
      if (done) return { ok: false, reply: 'This game is over.' };
      if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, reply: `Enter a whole number between 1 and ${max}.` };
      attempts.set(userId, (attempts.get(userId) || 0) + 1);
      history.push(n);

      if (n === secret) {
        done = true;
        collector.stop('done');
        games.unregister(interaction.channelId, game);
        for (const uid of attempts.keys()) store.recordResult(interaction.guildId, uid, 'guessnumber', uid === userId ? 'win' : 'loss');
        return {
          ok: true,
          react: '🎉',
          payload: {
            content: `🎉 **${name}** got it in ${attempts.get(userId)} guess(es)! The number was **${secret}**.`,
            attachments: [],
            files: [renderRange({ lo: secret, hi: secret, max, guesses: history, solved: { name, n: secret } })],
            components: row(true),
          },
        };
      }
      if (n < secret) {
        lo = Math.max(lo, n + 1);
        log.push(`⬆️ **${name}** guessed ${n} — higher!`);
      } else {
        hi = Math.min(hi, n - 1);
        log.push(`⬇️ **${name}** guessed ${n} — lower!`);
      }
      return { ok: true, react: n < secret ? '⬆️' : '⬇️', payload: { content: content(), attachments: [], files: [renderRange({ lo, hi, max, guesses: history })], components: row() } };
    }

    const game = {
      name: 'Guess the Number',
      hint: `Say a number between ${lo} and ${hi}, e.g. \`@${botName} 42\`.`,
      async onAnswer(message, textIn) {
        const res = guess(message.author.id, message.member?.displayName || message.author.username, Number.parseInt(textIn, 10));
        if (res.ok) await msg.edit(res.payload).catch(() => null);
        return res;
      },
      hostId: interaction.user.id,
      stop: () => collector.stop('stopped'),
      onReplaced: () => collector.stop('replaced'),
    };
    games.register(interaction.channelId, game);

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
      const res = guess(sub.user.id, sub.member?.displayName || sub.user.username, Number.parseInt(sub.fields.getTextInputValue('n'), 10));
      if (!res.ok) return sub.reply({ content: `❌ ${res.reply}`, flags: MessageFlags.Ephemeral });
      await sub.deferUpdate();
      await msg.edit(res.payload).catch(() => null);
    });

    collector.on('end', (_c, reason) => {
      games.unregister(interaction.channelId, game);
      if (reason !== 'done') {
        done = true;
        const note = reason === 'stopped' ? '🛑 Game stopped by the host.' : '⌛ Game timed out.';
        msg.edit({ content: `${note} The number was **${secret}**.`, components: row(true) }).catch(() => null);
      }
    });
  },
};
