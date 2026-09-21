const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const store = require('../lib/store');
const games = require('../lib/games');
const { gateGame, pick } = require('../lib/util');
const { renderHangman } = require('../lib/canvas');

const WORDS = [
  'discord', 'minecraft', 'keyboard', 'rainbow', 'dragon', 'pirate', 'jungle', 'rocket', 'castle', 'wizard', 'zombie', 'planet',
  'guitar', 'pumpkin', 'ninja', 'penguin', 'volcano', 'treasure', 'galaxy', 'monster', 'thunder', 'diamond', 'phoenix', 'samurai',
  'unicorn', 'vampire', 'robot', 'puzzle', 'shadow', 'crystal', 'lantern', 'meteor', 'oxygen', 'trophy', 'whisper', 'blizzard',
  'compass', 'falcon', 'harvest', 'island', 'kingdom', 'legend', 'magnet', 'nebula', 'orbit', 'quartz', 'raccoon', 'sphinx',
  'tornado', 'voyage', 'walrus', 'yogurt', 'zeppelin', 'anchor', 'bamboo', 'cactus', 'dolphin', 'eclipse', 'fossil', 'glacier',
];
const MAX_WRONG = 6;
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');

function menus(guessed, disabled = false) {
  return [ALPHA.slice(0, 13), ALPHA.slice(13)].map((letters, i) => {
    const options = letters.filter((l) => !guessed.has(l)).map((l) => ({ label: l.toUpperCase(), value: l }));
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`hang_${i}`)
      .setPlaceholder(i === 0 ? 'Pick a letter A–M' : 'Pick a letter N–Z')
      .setDisabled(disabled || options.length === 0)
      .addOptions(options.length ? options : [{ label: '—', value: 'none' }]);
    return new ActionRowBuilder().addComponents(menu);
  });
}

module.exports = {
  data: new SlashCommandBuilder().setName('hangman').setDescription('Start a game of hangman — anyone in the channel can guess').setDMPermission(false),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const word = pick(WORDS);
    const guessed = new Set();
    const participants = new Set();
    const botName = interaction.client.user.username;
    let wrong = 0;
    let done = false;

    const solved = () => [...word].every((ch) => guessed.has(ch));
    const header = (last = '') =>
      `🪢 **Hangman** — guess a letter with \`@${botName} e\`, the whole word with \`@${botName} rocket\`, or use the menus.${last ? `\n${last}` : ''}`;

    await interaction.reply({ content: header(), files: [renderHangman({ word, guessed, wrong, maxWrong: MAX_WRONG })], components: menus(guessed) });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 15 * 60_000 });

    async function endGame(won) {
      done = true;
      collector.stop('done');
      games.unregister(interaction.channelId, game);
      for (const uid of participants) store.recordResult(interaction.guildId, uid, 'hangman', won ? 'win' : 'loss');
      const who = [...participants].map((id) => `<@${id}>`).join(' ');
      return {
        content: won ? `🎉 **Solved!** The word was **${word.toUpperCase()}**. Nice work ${who}!` : `💀 **Game over.** The word was **${word.toUpperCase()}**.`,
        attachments: [],
        files: [renderHangman({ word, guessed, wrong, maxWrong: MAX_WRONG, revealed: true })],
        components: [],
      };
    }

    // Shared guess logic. Returns { ok, reply?, payload?, react? }.
    async function guess(userId, name, input) {
      if (done) return { ok: false, reply: 'This game is over.' };
      const t = input.toLowerCase().replace(/[^a-z]/g, '');
      if (!t) return { ok: false, reply: 'Guess a letter or a word.' };
      participants.add(userId);

      if (t.length > 1) {
        // whole-word guess
        if (t === word) {
          for (const ch of word) guessed.add(ch);
          return { ok: true, react: '🎉', payload: await endGame(true) };
        }
        wrong++;
        if (wrong >= MAX_WRONG) return { ok: true, react: '💀', payload: await endGame(false) };
        return {
          ok: true,
          react: '❌',
          payload: { content: header(`❌ **${name}** guessed **${t.toUpperCase()}** — not the word!`), attachments: [], files: [renderHangman({ word, guessed, wrong, maxWrong: MAX_WRONG })], components: menus(guessed) },
        };
      }

      if (guessed.has(t)) return { ok: false, reply: `**${t.toUpperCase()}** was already guessed.` };
      guessed.add(t);
      const hit = word.includes(t);
      if (!hit) wrong++;
      if (solved()) return { ok: true, react: '🎉', payload: await endGame(true) };
      if (wrong >= MAX_WRONG) return { ok: true, react: '💀', payload: await endGame(false) };
      return {
        ok: true,
        react: hit ? '✅' : '❌',
        payload: {
          content: header(`${hit ? '✅' : '❌'} **${name}** guessed **${t.toUpperCase()}**`),
          attachments: [],
          files: [renderHangman({ word, guessed, wrong, maxWrong: MAX_WRONG })],
          components: menus(guessed),
        },
      };
    }

    const game = {
      name: 'Hangman',
      hint: `Say a letter (\`@${botName} e\`) or the whole word.`,
      async onAnswer(message, textIn) {
        const res = await guess(message.author.id, message.member?.displayName || message.author.username, textIn);
        if (res.ok) await msg.edit(res.payload).catch(() => null);
        return res;
      },
      onReplaced: () => collector.stop('replaced'),
    };
    games.register(interaction.channelId, game);

    collector.on('collect', async (sel) => {
      const letter = sel.values[0];
      if (letter === 'none') return sel.deferUpdate();
      const res = await guess(sel.user.id, sel.member?.displayName || sel.user.username, letter);
      if (!res.ok) return sel.reply({ content: res.reply, flags: 64 });
      await sel.update(res.payload);
    });

    collector.on('end', (_c, reason) => {
      games.unregister(interaction.channelId, game);
      if (reason !== 'done') {
        done = true;
        msg.edit({ content: `⌛ Game timed out. The word was **${word.toUpperCase()}**.`, components: [] }).catch(() => null);
      }
    });
  },
};
