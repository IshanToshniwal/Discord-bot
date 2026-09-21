const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const store = require('../lib/store');
const { gateGame, userInfo } = require('../lib/util');
const { renderTicTacToe } = require('../lib/canvas');

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a], line };
  }
  return null;
}

function buildRows(board, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const v = board[i];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${i}`)
          .setLabel(v || '​')
          .setStyle(v === 'X' ? ButtonStyle.Danger : v === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(disabled || Boolean(v))
      );
    }
    rows.push(row);
  }
  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('Challenge someone to tic-tac-toe')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('opponent').setDescription('Who to play against').setRequired(true)),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const opponent = interaction.options.getUser('opponent');
    if (opponent.bot || opponent.id === interaction.user.id) {
      return interaction.reply({ content: '❌ Pick a real opponent (not yourself or a bot).', flags: MessageFlags.Ephemeral });
    }

    const oppMember = await interaction.guild.members.fetch(opponent.id).catch(() => null);
    const players = {
      X: userInfo(interaction.user, interaction.member),
      O: userInfo(opponent, oppMember),
    };
    const board = Array(9).fill(null);
    let turn = 'X';

    const content = () => `❌ ${players.X.name}  vs  ⭕ ${players.O.name}\n**${players[turn].name}**'s turn (${turn})`;

    await interaction.reply({
      content: content(),
      files: [renderTicTacToe(board)],
      components: buildRows(board),
    });
    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({ time: 5 * 60_000 });

    collector.on('collect', async (btn) => {
      const expected = players[turn].id;
      if (btn.user.id !== expected) {
        const isPlayer = btn.user.id === players.X.id || btn.user.id === players.O.id;
        return btn.reply({
          content: isPlayer ? "It's not your turn." : "You're not part of this game.",
          flags: MessageFlags.Ephemeral,
        });
      }
      const i = Number(btn.customId.split('_')[1]);
      if (board[i]) return btn.deferUpdate();
      board[i] = turn;

      const w = winner(board);
      const full = board.every(Boolean);
      if (w || full) {
        collector.stop('done');
        const gid = interaction.guildId;
        let text;
        if (w) {
          const loser = w.mark === 'X' ? 'O' : 'X';
          store.recordResult(gid, players[w.mark].id, 'tictactoe', 'win');
          store.recordResult(gid, players[loser].id, 'tictactoe', 'loss');
          text = `🏆 **${players[w.mark].name}** wins!`;
        } else {
          store.recordResult(gid, players.X.id, 'tictactoe', 'draw');
          store.recordResult(gid, players.O.id, 'tictactoe', 'draw');
          text = "🤝 It's a draw!";
        }
        return btn.update({
          content: `❌ ${players.X.name}  vs  ⭕ ${players.O.name}\n${text}`,
          attachments: [],
          files: [renderTicTacToe(board, w?.line)],
          components: buildRows(board, true),
        });
      }

      turn = turn === 'X' ? 'O' : 'X';
      await btn.update({ content: content(), attachments: [], files: [renderTicTacToe(board)], components: buildRows(board) });
    });

    collector.on('end', (_c, reason) => {
      if (reason !== 'done') {
        msg.edit({ content: '⌛ Game timed out.', components: buildRows(board, true) }).catch(() => null);
      }
    });
  },
};
