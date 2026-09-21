const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const { gateGame } = require('../lib/util');
const { renderWordle } = require('../lib/canvas');

const WORDS = fs
  .readFileSync(path.join(__dirname, '..', 'data', 'words.txt'), 'utf8')
  .split(/\s+/)
  .filter((w) => w.length === 5);

const MAX_GUESSES = 6;

// Everyone in a server gets the same word each day (IST-agnostic: uses UTC date).
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
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

function progress(guildId, userId) {
  const day = todayKey();
  store.data.wordle[guildId] ??= {};
  // Drop old days to keep the file small.
  for (const k of Object.keys(store.data.wordle[guildId])) if (k !== day) delete store.data.wordle[guildId][k];
  store.data.wordle[guildId][day] ??= {};
  store.data.wordle[guildId][day][userId] ??= { guesses: [], done: false, won: false };
  return store.data.wordle[guildId][day][userId];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Daily 5-letter word — 6 guesses, one word per day')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('guess').setDescription('Your 5-letter guess (leave empty to see your board)').setMinLength(5).setMaxLength(5)
    ),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const answer = dailyWord(guildId);
    const p = progress(guildId, userId);
    const raw = interaction.options.getString('guess');
    const title = `Wordle — ${todayKey()}`;
    const name = interaction.member?.displayName || interaction.user.username;

    // Boards are ephemeral so players can't see each other's guesses.
    if (!raw) {
      return interaction.reply({
        content: p.done
          ? p.won
            ? `🎉 You solved today's word in ${p.guesses.length}/${MAX_GUESSES}. Come back tomorrow!`
            : `😢 You're out of guesses for today. The word was **${answer.toUpperCase()}**.`
          : `You have **${MAX_GUESSES - p.guesses.length}** guesses left. Use \`/wordle guess:<word>\`.`,
        files: [renderWordle(p.guesses, { title })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const guess = raw.toLowerCase();
    if (!/^[a-z]{5}$/.test(guess)) {
      return interaction.reply({ content: '❌ Guess must be exactly 5 letters (A–Z).', flags: MessageFlags.Ephemeral });
    }
    if (p.done) {
      return interaction.reply({
        content: p.won ? '✅ You already solved today\'s word! Come back tomorrow.' : `❌ You're out of guesses for today. The word was **${answer.toUpperCase()}**.`,
        files: [renderWordle(p.guesses, { title })],
        flags: MessageFlags.Ephemeral,
      });
    }

    p.guesses.push({ word: guess, result: score(guess, answer) });
    const won = guess === answer;
    if (won || p.guesses.length >= MAX_GUESSES) {
      p.done = true;
      p.won = won;
      store.recordResult(guildId, userId, 'wordle', won ? 'win' : 'loss');
    } else {
      store.save();
    }

    let content;
    if (won) content = `🎉 **Correct!** You solved it in ${p.guesses.length}/${MAX_GUESSES}.`;
    else if (p.done) content = `😢 Out of guesses. The word was **${answer.toUpperCase()}**.`;
    else content = `**${MAX_GUESSES - p.guesses.length}** guesses left.`;

    await interaction.reply({ content, files: [renderWordle(p.guesses, { title })], flags: MessageFlags.Ephemeral });

    // Share a spoiler-free result publicly when the game is over.
    if (p.done) {
      const grid = p.guesses
        .map((g) => g.result.map((r) => (r === 'g' ? '🟩' : r === 'y' ? '🟨' : '⬛')).join(''))
        .join('\n');
      await interaction.channel
        .send(`**${name}** — Wordle ${todayKey()} ${won ? p.guesses.length : 'X'}/${MAX_GUESSES}\n${grid}`)
        .catch(() => null);
    }
  },
};
