const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const games = require('../lib/games');
const { gateGame, pick } = require('../lib/util');
const { renderWordle } = require('../lib/canvas');

const WORDS = fs.readFileSync(path.join(__dirname, '..', 'data', 'words.txt'), 'utf8').split(/\s+/).filter((w) => w.length === 5);
const MAX_GUESSES = 6;

const todayKey = () => new Date().toISOString().slice(0, 10);
function dailyWord(guildId) {
  const key = `${guildId}:${todayKey()}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return WORDS[h % WORDS.length];
}

// Standard Wordle scoring with duplicate-letter handling.
function score(guess, answer) {
  const res = Array(5).fill('x');
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 'g';
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === 'g') continue;
    if (remaining[guess[i]] > 0) {
      res[i] = 'y';
      remaining[guess[i]]--;
    }
  }
  return res;
}

const emojiGrid = (guesses) => guesses.map((g) => g.result.map((r) => (r === 'g' ? '🟩' : r === 'y' ? '🟨' : '⬛')).join('')).join('\n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Shared Wordle for the room — 6 guesses, everyone can contribute')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('guess').setDescription('Guess a 5-letter word in the running game').setMinLength(5).setMaxLength(5))
    .addBooleanOption((o) => o.setName('daily').setDescription("Start with today's server-wide word instead of a random one")),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const channelId = interaction.channelId;
    const botName = interaction.client.user.username;
    const guessOpt = interaction.options.getString('guess');
    const running = games.get(channelId);

    // ---- guess into a running game via slash ----
    if (guessOpt) {
      if (!running || running.name !== 'Wordle') {
        return interaction.reply({ content: '❌ No Wordle running here. Start one with `/wordle`.', flags: MessageFlags.Ephemeral });
      }
      const res = await running.onAnswer({ author: interaction.user, member: interaction.member }, guessOpt);
      return interaction.reply({ content: res.ok ? `✅ Guessed **${guessOpt.toUpperCase()}**.` : `❌ ${res.reply}`, flags: MessageFlags.Ephemeral });
    }
    if (running?.name === 'Wordle') {
      return interaction.reply({ content: `A Wordle is already running here — say \`@${botName} crane\` to guess.`, flags: MessageFlags.Ephemeral });
    }

    const daily = interaction.options.getBoolean('daily') ?? false;
    const answer = daily ? dailyWord(interaction.guildId) : pick(WORDS);
    const title = daily ? `Daily Wordle — ${todayKey()}` : 'Wordle';
    const guesses = [];
    const participants = new Set();
    let done = false;

    const status = () => `🟩 **${title}** — ${MAX_GUESSES - guesses.length} guesses left. Guess with \`@${botName} crane\` or \`/wordle guess:crane\`.`;
    await interaction.reply({ content: status(), files: [renderWordle(guesses, { title, subtitle: 'shared board — anyone can guess' })] });
    const msg = await interaction.fetchReply();

    const game = {
      name: 'Wordle',
      hint: `Say a 5-letter word, e.g. \`@${botName} crane\`.`,
      async onAnswer(message, textIn) {
        if (done) return { ok: false, reply: 'This Wordle is over.' };
        const guess = textIn.trim().toLowerCase();
        if (!/^[a-z]{5}$/.test(guess)) return { ok: false, reply: 'Guesses must be exactly 5 letters.' };
        if (guesses.some((g) => g.word === guess)) return { ok: false, reply: 'Already guessed that word.' };
        const name = message.member?.displayName || message.author.username;
        guesses.push({ word: guess, result: score(guess, answer), by: name });
        participants.add(message.author.id);
        const won = guess === answer;

        if (won || guesses.length >= MAX_GUESSES) {
          done = true;
          clearTimeout(timer);
          games.unregister(channelId, game);
          for (const uid of participants) store.recordResult(interaction.guildId, uid, 'wordle', won ? 'win' : 'loss');
          await msg
            .edit({
              content: won
                ? `🎉 **${name}** solved it in ${guesses.length}/${MAX_GUESSES}! The word was **${answer.toUpperCase()}**.\n${emojiGrid(guesses)}`
                : `😢 Out of guesses. The word was **${answer.toUpperCase()}**.\n${emojiGrid(guesses)}`,
              attachments: [],
              files: [renderWordle(guesses, { title, subtitle: won ? `solved by ${name}` : `answer: ${answer.toUpperCase()}` })],
            })
            .catch(() => null);
          return { ok: true, react: won ? '🎉' : '💀' };
        }
        await msg.edit({ content: status(), attachments: [], files: [renderWordle(guesses, { title, subtitle: `last guess by ${name}` })] }).catch(() => null);
        const g = guesses[guesses.length - 1].result;
        return { ok: true, react: g.includes('g') ? '🟩' : g.includes('y') ? '🟨' : '⬛' };
      },
      hostId: interaction.user.id,
      stop: () => {
        done = true;
        clearTimeout(timer);
        return msg.edit({ content: `🛑 Wordle stopped by the host. The word was **${answer.toUpperCase()}**.` }).catch(() => null);
      },
      onReplaced: () => {
        done = true;
        clearTimeout(timer);
      },
    };
    games.register(channelId, game);

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      games.unregister(channelId, game);
      msg.edit({ content: `⌛ Wordle timed out. The word was **${answer.toUpperCase()}**.` }).catch(() => null);
    }, 15 * 60_000);
  },
};
