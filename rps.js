const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const store = require('../lib/store');
const { gateGame, userInfo, pick } = require('../lib/util');
const { renderRps } = require('../lib/canvas');

const CHOICES = ['rock', 'paper', 'scissors'];
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function judge(c1, c2) {
  if (c1 === c2) return 'draw';
  return BEATS[c1] === c2 ? 'p1' : 'p2';
}

function rows(disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      CHOICES.map((c) =>
        new ButtonBuilder()
          .setCustomId(`rps_${c}`)
          .setLabel(c[0].toUpperCase() + c.slice(1))
          .setEmoji(EMOJI[c])
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
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

    // ---- vs bot ----
    if (!opponent || opponent.id === interaction.client.user.id) {
      const bot = userInfo(interaction.client.user, interaction.guild.members.me);
      await interaction.reply({ content: `${p1.name} vs **${bot.name}** — pick your move!`, components: rows() });
      const msg = await interaction.fetchReply();
      try {
        const btn = await msg.awaitMessageComponent({
          filter: (i) => i.user.id === p1.id,
          time: 60_000,
        });
        const c1 = btn.customId.split('_')[1];
        const c2 = pick(CHOICES);
        const result = judge(c1, c2);
        if (result === 'p1') store.recordResult(interaction.guildId, p1.id, 'rps', 'win');
        else if (result === 'p2') store.recordResult(interaction.guildId, p1.id, 'rps', 'loss');
        else store.recordResult(interaction.guildId, p1.id, 'rps', 'draw');
        return btn.update({
          content: '',
          attachments: [], files: [await renderRps({ p1, p2: bot, c1, c2, result })],
          components: [],
        });
      } catch {
        return msg.edit({ content: '⌛ No move made in time.', components: rows(true) }).catch(() => null);
      }
    }

    // ---- vs player ----
    if (opponent.bot || opponent.id === p1.id) {
      return interaction.reply({ content: '❌ Pick a real opponent (not yourself or a bot).', flags: MessageFlags.Ephemeral });
    }
    const oppMember = await interaction.guild.members.fetch(opponent.id).catch(() => null);
    const p2 = userInfo(opponent, oppMember);
    const picks = {};

    await interaction.reply({
      content: `🪨📄✂️ **${p1.name}** vs **${p2.name}**\nBoth players: pick your move (hidden until both have chosen).`,
      components: rows(),
    });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 60_000 });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== p1.id && btn.user.id !== p2.id) {
        return btn.reply({ content: "You're not part of this game.", flags: MessageFlags.Ephemeral });
      }
      if (picks[btn.user.id]) {
        return btn.reply({ content: 'You already picked!', flags: MessageFlags.Ephemeral });
      }
      picks[btn.user.id] = btn.customId.split('_')[1];
      await btn.reply({ content: `You chose **${picks[btn.user.id]}**. Waiting for the other player…`, flags: MessageFlags.Ephemeral });

      if (picks[p1.id] && picks[p2.id]) {
        collector.stop('done');
        const c1 = picks[p1.id];
        const c2 = picks[p2.id];
        const result = judge(c1, c2);
        const gid = interaction.guildId;
        if (result === 'draw') {
          store.recordResult(gid, p1.id, 'rps', 'draw');
          store.recordResult(gid, p2.id, 'rps', 'draw');
        } else {
          store.recordResult(gid, result === 'p1' ? p1.id : p2.id, 'rps', 'win');
          store.recordResult(gid, result === 'p1' ? p2.id : p1.id, 'rps', 'loss');
        }
        await msg.edit({
          content: '',
          attachments: [], files: [await renderRps({ p1, p2, c1, c2, result })],
          components: [],
        });
      }
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'done') return;
      await msg
        .edit({
          content: '⌛ Time ran out before both players picked.',
          attachments: [], files: [await renderRps({ p1, p2, c1: picks[p1.id], c2: picks[p2.id], result: 'draw' })],
          components: [],
        })
        .catch(() => null);
    });
  },
};
