const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const store = require('../lib/store');
const { gateGame, pick } = require('../lib/util');
const { renderHangman } = require('../lib/canvas');

const WORDS = [
  'discord', 'minecraft', 'keyboard', 'rainbow', 'dragon', 'pirate', 'jungle', 'rocket', 'castle',
  'wizard', 'zombie', 'planet', 'guitar', 'pumpkin', 'ninja', 'penguin', 'volcano', 'treasure',
  'galaxy', 'monster', 'thunder', 'diamond', 'phoenix', 'samurai', 'unicorn', 'vampire', 'robot',
  'puzzle', 'shadow', 'crystal', 'lantern', 'meteor', 'oxygen', 'trophy', 'whisper', 'blizzard',
  'compass', 'falcon', 'harvest', 'island', 'kingdom', 'legend', 'magnet', 'nebula', 'orbit',
  'quartz', 'raccoon', 'sphinx', 'tornado', 'voyage', 'walrus', 'yogurt', 'zeppelin', 'anchor',
];
const MAX_WRONG = 6;
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');

function menus(guessed, disabled = false) {
  const halves = [ALPHA.slice(0, 13), ALPHA.slice(13)];
  return halves.map((letters, i) => {
    const options = letters
      .filter((l) => !guessed.has(l))
      .map((l) => ({ label: l.toUpperCase(), value: l }));
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`hang_${i}`)
      .setPlaceholder(i === 0 ? 'Pick a letter A–M' : 'Pick a letter N–Z')
      .setDisabled(disabled || options.length === 0)
      .addOptions(options.length ? options : [{ label: '—', value: 'none' }]);
    return new ActionRowBuilder().addComponents(menu);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hangman')
    .setDescription('Start a game of hangman — anyone in the channel can guess')
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const word = pick(WORDS);
    const guessed = new Set();
    let wrong = 0;
    const participants = new Set();

    const solved = () => [...word].every((ch) => guessed.has(ch));
    const header = () => `🪢 **Hangman** — started by ${interaction.user}. Pick letters from the menus below.`;

    await interaction.reply({
      content: header(),
      files: [renderHangman({ word, guessed, wrong, maxWrong: MAX_WRONG })],
      components: menus(guessed),
    });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 10 * 60_000 });

    collector.on('collect', async (sel) => {
      const letter = sel.values[0];
      if (letter === 'none' || guessed.has(letter)) return sel.deferUpdate();
      guessed.add(letter);
      participants.add(sel.user.id);
      if (!word.includes(letter)) wrong++;

      const name = sel.member?.displayName || sel.user.username;
      const hit = word.includes(letter);

      if (solved() || wrong >= MAX_WRONG) {
        collector.stop('done');
        const won = solved();
        for (const uid of participants) store.recordResult(interaction.guildId, uid, 'hangman', won ? 'win' : 'loss');
        return sel.update({
          content: won
            ? `🎉 **Solved!** The word was **${word.toUpperCase()}**. Nice work, ${[...participants].map((id) => `<@${id}>`).join(' ')}!`
            : `💀 **Game over.** The word was **${word.toUpperCase()}**.`,
          attachments: [],
          files: [renderHangman({ word, guessed, wrong, maxWrong: MAX_WRONG, revealed: true })],
          components: [],
        });
      }

      await sel.update({
        content: `${header()}\n${hit ? '✅' : '❌'} **${name}** guessed **${letter.toUpperCase()}**`,
        attachments: [],
        files: [renderHangman({ word, guessed, wrong, maxWrong: MAX_WRONG })],
        components: menus(guessed),
      });
    });

    collector.on('end', (_c, reason) => {
      if (reason !== 'done') {
        msg.edit({ content: `⌛ Game timed out. The word was **${word.toUpperCase()}**.`, components: [] }).catch(() => null);
      }
    });
  },
};
