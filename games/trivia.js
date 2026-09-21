const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const games = require('../lib/games');
const { gateGame, pick, shuffle } = require('../lib/util');
const { renderCard, C } = require('../lib/canvas');
const QUESTIONS = require('../data/trivia.json');

const CATEGORIES = [...new Set(QUESTIONS.map((q) => q.c))];
const LETTERS = ['A', 'B', 'C', 'D'];
const TIME = 20_000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Ask a trivia question — everyone in the channel can answer')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('category').setDescription('Pick a category (random if empty)').addChoices(...CATEGORIES.map((c) => ({ name: c, value: c })))
    ),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const category = interaction.options.getString('category');
    const pool = category ? QUESTIONS.filter((q) => q.c === category) : QUESTIONS;
    const q = pick(pool);
    const options = shuffle([q.a, ...q.w]);
    const correctIndex = options.indexOf(q.a);
    const ends = Math.floor((Date.now() + TIME) / 1000);
    const botName = interaction.client.user.username;

    const embed = new EmbedBuilder()
      .setTitle(`🧠 Trivia — ${q.c}`)
      .setDescription(
        `**${q.q}**\n\n${options.map((o, i) => `**${LETTERS[i]}.** ${o}`).join('\n')}\n\nAnswer with a button or \`@${botName} b\` — ends <t:${ends}:R>.`
      )
      .setColor(0x6d7cff);

    const row = new ActionRowBuilder().addComponents(
      options.map((_, i) => new ButtonBuilder().setCustomId(`trivia_${i}`).setLabel(LETTERS[i]).setStyle(ButtonStyle.Primary))
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    const msg = await interaction.fetchReply();
    const answers = new Map(); // userId -> { index, name }
    let done = false;

    function answer(userId, name, idx) {
      if (done) return { ok: false, reply: 'This question is over.' };
      if (answers.has(userId)) return { ok: false, reply: 'You already answered!' };
      if (!(idx >= 0 && idx < options.length)) return { ok: false, reply: 'Answer with A, B, C or D (or the option text).' };
      answers.set(userId, { index: idx, name });
      return { ok: true };
    }

    const game = {
      name: 'Trivia',
      hint: `Say \`@${botName} a\` / \`b\` / \`c\` / \`d\`.`,
      async onAnswer(message, textIn) {
        const t = textIn.trim().toLowerCase().replace(/[.)]$/, '');
        let idx = LETTERS.map((l) => l.toLowerCase()).indexOf(t);
        if (idx === -1) idx = options.findIndex((o) => o.toLowerCase() === t);
        const res = answer(message.author.id, message.member?.displayName || message.author.username, idx);
        return res.ok ? { ok: true, react: '🔒' } : res;
      },
      onReplaced: () => collector.stop('replaced'),
    };
    games.register(interaction.channelId, game);

    const collector = msg.createMessageComponentCollector({ time: TIME });
    collector.on('collect', async (btn) => {
      const idx = Number(btn.customId.split('_')[1]);
      const res = answer(btn.user.id, btn.member?.displayName || btn.user.username, idx);
      if (!res.ok) return btn.reply({ content: res.reply, flags: MessageFlags.Ephemeral });
      await btn.reply({ content: `Locked in **${LETTERS[idx]}**.`, flags: MessageFlags.Ephemeral });
    });

    collector.on('end', async () => {
      done = true;
      games.unregister(interaction.channelId, game);
      const winners = [];
      for (const [uid, a] of answers) {
        const correct = a.index === correctIndex;
        store.recordResult(interaction.guildId, uid, 'trivia', correct ? 'win' : 'loss');
        if (correct) winners.push(a.name);
      }
      const disabled = new ActionRowBuilder().addComponents(
        options.map((_, i) =>
          new ButtonBuilder()
            .setCustomId(`trivia_${i}`)
            .setLabel(LETTERS[i])
            .setStyle(i === correctIndex ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );
      const card = renderCard({
        title: `Answer: ${LETTERS[correctIndex]}. ${q.a}`,
        subtitle: q.q,
        body: winners.length ? `✔ ${winners.length} correct: ${winners.join(', ')}` : answers.size ? 'Nobody got it right this time.' : 'Nobody answered.',
        accent: winners.length ? C.green : C.red,
        footer: `${answers.size} player(s) answered`,
      });
      await msg.edit({ components: [disabled], attachments: [], files: [card] }).catch(() => null);
    });
  },
};
