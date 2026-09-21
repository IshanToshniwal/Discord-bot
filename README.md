# MiniRoom Discord Bot

Private **minigame rooms** plus a set of **minigames with image-based boards and a leaderboard**.

## Commands

### Rooms
| Command | Who | What it does |
|---|---|---|
| `/miniroom create [category]` | Admins | Posts the panel with a **Create Room** button. Optionally choose the category rooms are made in. |
| `/miniroom close` | Room owner | Deletes the owner's room. |
| `/miniroom add @user` | Room owner | Gives a user access to the room. |
| `/miniroom remove @user` | Room owner | Removes a user's access. |
| `/miniroom games anywhere:true/false` | Admins | By default games only work inside minigame rooms. Set `true` to allow them in any channel. |

Members create rooms by clicking **Create Room** on the panel. Rooms are named `minigame-<username>`. One room per member.

### Answering games by pinging the bot
Every game accepts answers as a message that mentions the bot — no menus or popups needed:

| Game | Example |
|---|---|
| Tic-tac-toe | `@Bot 5` (square 1–9) |
| Rock-paper-scissors | `@Bot rock` / `paper` / `scissors` (message is deleted so the pick stays hidden) |
| Trivia | `@Bot b` or the option text |
| Wordle | `@Bot crane` |
| Hangman | `@Bot e` for a letter, `@Bot rocket` for the whole word |
| Guess the number | `@Bot 42` |

The bot reacts to your message (✅ / ❌ / 🟩 …) and updates the board image. Buttons and menus still work too.
Ping the bot with no text to see what's running. This works out of the box; to also accept answers
**without** the ping, set `ANSWER_WITHOUT_PING=true` and enable **Message Content Intent** in the Developer Portal.

### Games (all render as images)
| Command | Description |
|---|---|
| `/tictactoe @user` | Two-player tic-tac-toe with buttons; board drawn as an image. |
| `/rps [@user]` | Rock-paper-scissors vs a friend (hidden picks) or vs the bot. |
| `/trivia [category]` | Everyone in the channel answers with buttons in 20s; result card shows winners. |
| `/wordle [daily]` | Shared 5-letter word for the room, 6 guesses, anyone can contribute. `daily:true` uses the server's word of the day. |
| `/hangman` | Co-op hangman — pick letters from dropdowns. |
| `/guessnumber [max]` | Guess the secret number; live range bar image narrows with each guess. |
| `/8ball question` | Magic 8-ball. |
| `/roll [NdS]` | Dice, e.g. `2d6`, `d20`. |
| `/coinflip [call]` | Flip a coin; call it to count on the leaderboard. |
| `/leaderboard [game]` | Top 10 players by wins, as an image, with your own record. |

## 1. Create the Discord application

1. <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy it (`DISCORD_TOKEN`). Enable **Server Members Intent**.
3. **General Information** → copy **Application ID** (`CLIENT_ID`).
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions
   **Manage Channels**, **Manage Roles**, **View Channels**, **Send Messages**, **Embed Links**,
   **Attach Files**, **Read Message History**. Open the URL and invite the bot.

> The bot's role must be **above** any roles it manages and needs access to the room category.

## 2. Run locally (optional)

```bash
npm install
cp .env.example .env     # fill in DISCORD_TOKEN, CLIENT_ID (+ GUILD_ID for instant testing)
npm run deploy           # registers the slash commands
npm start
```

## 3. Deploy on Render

1. Push this folder to a GitHub repo.
2. <https://render.com> → **New → Web Service** → connect the repo. `render.yaml` sets:
   - Build command: `npm install && npm run deploy`
   - Start command: `npm start`
3. Environment variables:
   - `DISCORD_TOKEN`, `CLIENT_ID` — required
   - `GUILD_ID` — optional; instant command registration in one server
   - `DATA_CHANNEL_ID` — optional but **recommended** (see below)
   - `ANSWER_WITHOUT_PING` — optional, `true` to answer games without pinging (needs Message Content Intent)
4. Deploy. The bot serves `/` and `/health` on Render's `PORT`.

### Keeping the leaderboard after redeploys (`DATA_CHANNEL_ID`)

Render's free disk is wiped on every deploy. To keep stats, create a **private text channel**
(e.g. `#bot-data`) that only the bot and admins can see, copy its ID (Developer Mode → right-click →
Copy Channel ID) and set it as `DATA_CHANNEL_ID`. The bot uploads `data.json` there whenever stats
change and restores it on startup. Rooms themselves are always recovered from channel topics.

## 4. Keep it awake with UptimeRobot

1. Copy your Render URL, e.g. `https://miniroom-bot.onrender.com`.
2. <https://uptimerobot.com> → **New Monitor** → HTTP(s) → URL `https://miniroom-bot.onrender.com/health` → interval 5 min.

## Customising

- Trivia questions: `data/trivia.json` (`c` = category, `q` = question, `a` = answer, `w` = wrong options).
- Wordle answers: `data/words.txt`. Hangman words: top of `games/hangman.js`.
- Colours and drawing: `lib/canvas.js`.
- Add a game: drop a file in `games/` exporting `{ data, execute }` — it's registered automatically.
