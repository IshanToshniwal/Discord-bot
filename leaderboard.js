const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const { renderLeaderboard } = require('../lib/canvas');

const GAMES = ['tictactoe', 'rps', 'trivia', 'wordle', 'hangman', 'guessnumber', 'coinflip'];
const LABEL = {
  tictactoe: 'Tic-Tac-Toe', rps: 'Rock Paper Scissors', trivia: 'Trivia', wordle: 'Wordle',
  hangman: 'Hangman', guessnumber: 'Guess the Number', coinflip: 'Coinflip',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top players')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('game').setDescription('Filter by game (all games if empty)').addChoices(...GAMES.map((g) => ({ name: LABEL[g], value: g })))
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const game = interaction.options.getString('game');
    const all = store.data.stats[interaction.guildId] || {};

    const rows = Object.entries(all)
      .map(([uid, s]) => {
        const src = game ? s.byGame?.[game] : s;
        return src ? { uid, wins: src.wins || 0, games: src.games || 0 } : null;
      })
      .filter((r) => r && r.games > 0)
      .sort((a, b) => b.wins - a.wins || a.games - b.games)
      .slice(0, 10);

    const entries = [];
    for (const r of rows) {
      const member = await interaction.guild.members.fetch(r.uid).catch(() => null);
      const user = member?.user || (await interaction.client.users.fetch(r.uid).catch(() => null));
      entries.push({
        name: member?.displayName || user?.username || 'Unknown player',
        avatarURL: (member || user)?.displayAvatarURL({ extension: 'png', size: 128 }) || '',
        wins: r.wins,
        games: r.games,
      });
    }

    const title = game ? `${LABEL[game]} Leaderboard` : `${interaction.guild.name} Leaderboard`;
    const image = await renderLeaderboard({ title, entries });

    // Personal rank line for the caller
    const me = all[interaction.user.id];
    const mine = me ? (game ? me.byGame?.[game] : me) : null;
    const footer = mine?.games
      ? `Your record: **${mine.wins}** wins in **${mine.games}** games.`
      : "You haven't played yet — go win something!";

    await interaction.editReply({ content: footer, files: [image] });
  },
};
