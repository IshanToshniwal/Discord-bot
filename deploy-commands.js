// Registers the /miniroom slash commands with Discord.
// Run once (and again whenever you change the commands): npm run deploy
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('miniroom')
    .setDescription('Minigame room commands')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('[Admin] Post the minigame room panel in this channel')
        .addChannelOption((opt) =>
          opt
            .setName('category')
            .setDescription('Category where minigame rooms will be created (optional)')
            .addChannelTypes(4) // GuildCategory
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('close').setDescription('Close your minigame room (room owner only)')
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a user to your minigame room')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('User to add').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a user from your minigame room')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('User to remove').setRequired(true)
        )
    )
    .setDMPermission(false)
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      // Guild commands update instantly — best for testing.
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`Registered guild commands for guild ${process.env.GUILD_ID}`);
    } else {
      // Global commands can take up to an hour to appear.
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('Registered global commands');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
})();
