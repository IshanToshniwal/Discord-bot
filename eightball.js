const { SlashCommandBuilder } = require('discord.js');
const { gateGame, pick } = require('../lib/util');
const { renderEightBall } = require('../lib/canvas');

const ANSWERS = [
  ['It is certain.', 'yes'], ['Without a doubt.', 'yes'], ['Yes, definitely.', 'yes'],
  ['You may rely on it.', 'yes'], ['Most likely.', 'yes'], ['Outlook good.', 'yes'],
  ['Signs point to yes.', 'yes'], ['Yes.', 'yes'],
  ['Reply hazy, try again.', 'maybe'], ['Ask again later.', 'maybe'], ['Better not tell you now.', 'maybe'],
  ['Cannot predict now.', 'maybe'], ['Concentrate and ask again.', 'maybe'],
  ["Don't count on it.", 'no'], ['My reply is no.', 'no'], ['My sources say no.', 'no'],
  ['Outlook not so good.', 'no'], ['Very doubtful.', 'no'],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a yes/no question')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true).setMaxLength(200)),

  async execute(interaction) {
    if (!(await gateGame(interaction))) return;
    const question = interaction.options.getString('question');
    const [answer, tone] = pick(ANSWERS);
    await interaction.reply({
      content: `🎱 ${interaction.user} asked: *${question}*`,
      files: [renderEightBall(question, answer, tone)],
    });
  },
};
