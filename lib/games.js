// Registry of the game currently running in each channel, so players can answer
// by mentioning the bot: "@Bot e", "@Bot 42", "@Bot rock", "@Bot b" ...
//
// Each game registers { name, hint, onAnswer(message, text) } when it starts and
// unregisters when it ends. onAnswer returns:
//   { ok: true, react?: '✅' }      -> accepted (bot reacts to the message)
//   { ok: false, reply?: 'text' }   -> rejected (bot replies briefly, auto-deletes)
const active = new Map(); // channelId -> game

function register(channelId, game) {
  const prev = active.get(channelId);
  if (prev?.onReplaced) prev.onReplaced();
  active.set(channelId, game);
}

function unregister(channelId, game) {
  if (!game || active.get(channelId) === game) active.delete(channelId);
}

function get(channelId) {
  return active.get(channelId);
}

// Called from index.js on every message that mentions the bot.
async function handleMessage(message, client, allowBare = false) {
  if (message.author.bot || !message.inGuild()) return;
  const mentioned = message.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true });
  if (!mentioned && !allowBare) return;

  const text = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();
  const game = active.get(message.channelId);

  if (!game) {
    if (!mentioned) return;
    return reply(message, '🎮 No game is running here. Start one with `/tictactoe`, `/hangman`, `/wordle`, `/trivia`, `/guessnumber` or `/rps`.');
  }
  if (!text) {
    return reply(message, `🎮 **${game.name}** is running. ${game.hint}`);
  }

  try {
    const res = await game.onAnswer(message, text);
    if (!res) return;
    if (res.ok) {
      await message.react(res.react || '✅').catch(() => null);
      if (res.delete) await message.delete().catch(() => null);
    } else if (res.reply) {
      await reply(message, res.reply);
    } else {
      await message.react('❌').catch(() => null);
    }
  } catch (err) {
    console.error(`Answer handling failed (${game.name}):`, err);
  }
}

async function reply(message, content, ttl = 8000) {
  const m = await message.reply({ content, allowedMentions: { repliedUser: false } }).catch(() => null);
  if (m && ttl) setTimeout(() => m.delete().catch(() => null), ttl);
}

module.exports = { register, unregister, get, handleMessage };
