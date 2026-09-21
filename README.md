# MiniRoom Discord Bot

Creates private **minigame rooms** on demand. Each room is a text channel named
`minigame-<username>` that only the owner (and the people they add) can see.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/miniroom create [category]` | Admins only | Posts the panel with a **Create Room** button. Optionally choose the category rooms are made in. |
| `/miniroom close` | Room owner | Deletes the owner's room. |
| `/miniroom add @user` | Room owner | Gives a user access to the room. |
| `/miniroom remove @user` | Room owner | Removes a user's access. |

Members create rooms by clicking the **Create Room** button on the panel. One room per member.

## 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy it (this is `DISCORD_TOKEN`).
3. Under **Privileged Gateway Intents** enable **Server Members Intent**.
4. **General Information** → copy **Application ID** (this is `CLIENT_ID`).
5. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`;
   bot permissions **Manage Channels**, **Manage Roles**, **View Channels**,
   **Send Messages**, **Embed Links**, **Read Message History**.
   Open the generated URL and invite the bot to your server.

> The bot's role must be **above** any roles it needs to manage, and it needs
> access to the category you pick for rooms.

## 2. Run locally (optional)

```bash
npm install
cp .env.example .env     # fill in DISCORD_TOKEN, CLIENT_ID, (GUILD_ID for instant testing)
npm run deploy           # registers the slash commands
npm start
```

## 3. Deploy on Render

1. Push this folder to a GitHub repo.
2. On <https://render.com> → **New → Web Service** → connect the repo.
   Render reads `render.yaml` automatically. If you configure it manually:
   - Runtime: **Node**
   - Build command: `npm install && npm run deploy`
   - Start command: `npm start`
3. Add environment variables: `DISCORD_TOKEN`, `CLIENT_ID` (and `GUILD_ID` if you
   want instant registration in one server; leave blank for global commands).
4. Deploy. The bot binds to Render's `PORT` and serves `/` and `/health`.

## 4. Keep it awake with UptimeRobot

Render's free tier sleeps after 15 minutes without traffic.

1. Copy your Render URL, e.g. `https://miniroom-bot.onrender.com`.
2. On <https://uptimerobot.com> → **Add New Monitor**:
   - Type: **HTTP(s)**
   - URL: `https://miniroom-bot.onrender.com/health`
   - Interval: **5 minutes**
3. Save. UptimeRobot now pings the bot so it stays online.

## Notes

- Room ownership is stored in `data.json` **and** in each room channel's topic
  (`miniroom-owner:<userId>`), so rooms survive redeploys even though Render's
  free disk is wiped.
- Users with **Administrator** or **Manage Server** can run `/miniroom create`.
