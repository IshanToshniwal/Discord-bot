const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const games = require('../lib/games');
const { gateGame, userInfo, pick } = require('../lib/util');
const { renderRps } = require('../lib/canvas');

const CHOICES = ['rock', 'paper', 'scissors'];
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const ALIASES = { r: 'rock', p: 'paper', s: 'scissors', rock: 'rock', paper: 'paper', scissors: 'scissors', scissor: 'scissors' };

const judge = (c1, c2) => (c1 === c2 ? 'draw' : BEATS[c1] === c2 ? 'p1' : 'p2');

function rows(disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      CHOICES.map((c) =>
        new ButtonBuilder().setCustomId(`rps_${c}`).setLabel(c[0].toUpperCase() + c.slice(1)).setEmoji(EMOJI[c]).setStyle(ButtonStyle.Secondary).setDisabled(disabled)
      )
    ),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Rock, paper, scissors — against a friend or the bot')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('opponent').setDescription('Leave empty to play against the bot')),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const opponent = interaction.options.getUser('opponent');
    const p1 = userInfo(interaction.user, interaction.member);
    const gid = interaction.guildId;
    const botName = interaction.client.user.username;
    const vsBot = !opponent || opponent.id === interaction.client.user.id;
    const p2 = vsBot
      ? userInfo(interaction.client.user, interaction.guild.members.me)
      : userInfo(opponent, await interaction.guild.members.fetch(opponent.id).catch(() => null));

    if (!vsBot && (opponent.bot || opponent.id === p1.id)) {
      return interaction.reply({ content: '❌ Pick a real opponent (not yourself or a bot).', flags: MessageFlags.Ephemeral });
    }

    const picks = {};
    if (vsBot) picks[p2.id] = pick(CHOICES);

    await interaction.reply({
      content: vsBot
        ? `🪨📄✂️ **${p1.name}** vs **${p2.name}** — pick your move (button, or \`@${botName} rock\`).`
        : `🪨📄✂️ **${p1.name}** vs **${p2.name}**\nBoth players: pick a move — button, or \`@${botName} rock\` (your message gets deleted so it stays hidden).`,
      components: rows(),
    });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 90_000 });
    let done = false;

    async function finish() {
      done = true;
      collector.stop('done');
      games.unregister(interaction.channelId, game);
      const c1 = picks[p1.id];
      const c2 = picks[p2.id];
      const result = judge(c1, c2);
      if (result === 'draw') {
        store.recordResult(gid, p1.id, 'rps', 'draw');
        if (!vsBot) store.recordResult(gid, p2.id, 'rps', 'draw');
      } else {
        store.recordResult(gid, result === 'p1' ? p1.id : p2.id, 'rps', 'win');
        if (!vsBot || result === 'p2') store.recordResult(gid, result === 'p1' ? p2.id : p1.id, 'rps', 'loss');
      }
      await msg.edit({ content: '', attachments: [], files: [await renderRps({ p1, p2, c1, c2, result })], components: [] }).catch(() => null);
    }

    // Shared pick logic. Returns { ok, reply? }.
    function choose(userId, choice) {
      if (done) return { ok: false, reply: 'This game is over.' };
      if (userId !== p1.id && userId !== p2.id) return { ok: false, reply: "You're not part of this game." };
      if (picks[userId]) return { ok: false, reply: 'You already picked!' };
      if (!CHOICES.includes(choice)) return { ok: false, reply: 'Say rock, paper or scissors.' };
      picks[userId] = choice;
      return { ok: true };
    }

    const game = {
      name: 'Rock Paper Scissors',
      hint: `Say \`@${botName} rock\`, \`paper\` or \`scissors\`.`,
      async onAnswer(message, textIn) {
        const res = choose(message.author.id, ALIASES[textIn.toLowerCase()]);
        if (!res.ok) return res;
        if (picks[p1.id] && picks[p2.id]) await finish();
        return { ok: true, react: '🤫', delete: !vsBot };
      },
      hostId: p1.id,
      stop: () => collector.stop('stopped'),
      onReplaced: () => collector.stop('replaced'),
    };
    games.register(interaction.channelId, game);

    collector.on('collect', async (btn) => {
      const res = choose(btn.user.id, btn.customId.split('_')[1]);
      if (!res.ok) return btn.reply({ content: res.reply, flags: MessageFlags.Ephemeral });
      if (picks[p1.id] && picks[p2.id]) {
        await btn.deferUpdate();
        return finish();
      }
      await btn.reply({ content: `You chose **${picks[btn.user.id]}**. Waiting for the other player…`, flags: MessageFlags.Ephemeral });
    });

    collector.on('end', async (_c, reason) => {
      games.unregister(interaction.channelId, game);
      if (reason === 'done') return;
      done = true;
      if (reason === 'stopped') return msg.edit({ content: '🛑 Game stopped by the host.', components: [] }).catch(() => null);
      await msg
        .edit({
          content: '⌛ Time ran out before both players picked.',
          attachments: [],
          files: [await renderRps({ p1, p2, c1: picks[p1.id], c2: vsBot ? null : picks[p2.id], result: 'draw' })],
          components: [],
        })
        .catch(() => null);
    });
  },
};
