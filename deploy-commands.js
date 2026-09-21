// Registers all slash commands with Discord. Runs automatically in the Render build.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
for (const dir of ['commands', 'games']) {
  const full = path.join(__dirname, dir);
  for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(full, file));
    if (cmd?.data) commands.push(cmd.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log(`Registered ${commands.length} guild commands for guild ${process.env.GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log(`Registered ${commands.length} global commands`);
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
})();
