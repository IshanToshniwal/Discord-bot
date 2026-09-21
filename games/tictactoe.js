const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const games = require('../lib/games');
const { gateGame, userInfo } = require('../lib/util');
const { renderTicTacToe } = require('../lib/canvas');

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

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
          .setLabel(v || String(i + 1))
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
    const players = { X: userInfo(interaction.user, interaction.member), O: userInfo(opponent, oppMember) };
    const names = { X: players.X.name, O: players.O.name };
    const board = Array(9).fill(null);
    let turn = 'X';
    let over = false;

    const status = () =>
      `❌ ${players.X.name}  vs  ⭕ ${players.O.name}\n**${players[turn].name}**'s turn (${turn}) — tap a square or say \`@${interaction.client.user.username} 1-9\``;

    await interaction.reply({ content: status(), files: [renderTicTacToe(board, null, { names, turn })], components: buildRows(board) });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 10 * 60_000 });

    // Shared move logic for buttons and text. Returns { ok, reply?, payload }.
    function move(userId, i) {
      if (over) return { ok: false, reply: 'This game is over.' };
      const isPlayer = userId === players.X.id || userId === players.O.id;
      if (!isPlayer) return { ok: false, reply: "You're not part of this game." };
      if (userId !== players[turn].id) return { ok: false, reply: "It's not your turn." };
      if (!(i >= 0 && i < 9)) return { ok: false, reply: 'Pick a square from 1 to 9.' };
      if (board[i]) return { ok: false, reply: 'That square is taken.' };
      board[i] = turn;

      const w = winner(board);
      const full = board.every(Boolean);
      if (w || full) {
        over = true;
        collector.stop('done');
        games.unregister(interaction.channelId, game);
        const gid = interaction.guildId;
        let line;
        if (w) {
          const loser = w.mark === 'X' ? 'O' : 'X';
          store.recordResult(gid, players[w.mark].id, 'tictactoe', 'win');
          store.recordResult(gid, players[loser].id, 'tictactoe', 'loss');
          line = `🏆 **${players[w.mark].name}** wins!`;
        } else {
          store.recordResult(gid, players.X.id, 'tictactoe', 'draw');
          store.recordResult(gid, players.O.id, 'tictactoe', 'draw');
          line = "🤝 It's a draw!";
        }
        return {
          ok: true,
          payload: {
            content: `❌ ${players.X.name}  vs  ⭕ ${players.O.name}\n${line}`,
            attachments: [],
            files: [renderTicTacToe(board, w?.line, { names })],
            components: buildRows(board, true),
          },
        };
      }
      turn = turn === 'X' ? 'O' : 'X';
      return {
        ok: true,
        payload: { content: status(), attachments: [], files: [renderTicTacToe(board, null, { names, turn })], components: buildRows(board) },
      };
    }

    const game = {
      name: 'Tic-Tac-Toe',
      hint: `Say a square number 1–9, e.g. \`@${interaction.client.user.username} 5\`.`,
      async onAnswer(message, textIn) {
        const n = Number.parseInt(textIn, 10);
        const res = move(message.author.id, Number.isInteger(n) ? n - 1 : -1);
        if (res.ok) await msg.edit(res.payload).catch(() => null);
        return res;
      },
      onReplaced: () => collector.stop('replaced'),
    };
    games.register(interaction.channelId, game);

    collector.on('collect', async (btn) => {
      const res = move(btn.user.id, Number(btn.customId.split('_')[1]));
      if (!res.ok) return btn.reply({ content: res.reply, flags: MessageFlags.Ephemeral });
      await btn.update(res.payload);
    });

    collector.on('end', (_c, reason) => {
      games.unregister(interaction.channelId, game);
      if (reason !== 'done') {
        over = true;
        msg.edit({ content: '⌛ Game timed out.', components: buildRows(board, true) }).catch(() => null);
      }
    });
  },
};
