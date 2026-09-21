const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { encodeGif } = require('../lib/gif');
const { renderFrames, EFFECT_NAMES } = require('../lib/gifeffects');

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const SIZES = { small: 160, medium: 256, large: 360 };
const LABEL = {
  spin: '🔄 Spin', bounce: '⬆️ Bounce', shake: '🫨 Shake', zoom: '🔍 Zoom', wiggle: '〰️ Wiggle', flip: '🔁 Flip',
  fade: '🌫️ Fade', slide: '➡️ Slide', rainbow: '🌈 Rainbow', pulse: '💓 Pulse', still: '🖼️ Just convert (no animation)',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gif')
    .setDescription('Turn an image (or an avatar) into an animated GIF')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('effect').setDescription('Animation effect').setRequired(true).addChoices(...EFFECT_NAMES.map((e) => ({ name: LABEL[e] || e, value: e })))
    )
    .addAttachmentOption((o) => o.setName('image').setDescription('Image to animate (PNG/JPG/WebP/GIF)'))
    .addUserOption((o) => o.setName('user').setDescription("Use this user's avatar instead of an image"))
    .addStringOption((o) =>
      o.setName('size').setDescription('Output size (default medium)').addChoices({ name: 'Small (160px)', value: 'small' }, { name: 'Medium (256px)', value: 'medium' }, { name: 'Large (360px)', value: 'large' })
    )
    .addStringOption((o) =>
      o.setName('speed').setDescription('Animation speed').addChoices({ name: 'Slow', value: 'slow' }, { name: 'Normal', value: 'normal' }, { name: 'Fast', value: 'fast' })
    ),

  async execute(interaction) {
    const effect = interaction.options.getString('effect');
    const attachment = interaction.options.getAttachment('image');
    const user = interaction.options.getUser('user');
    const size = SIZES[interaction.options.getString('size') || 'medium'];
    const speed = interaction.options.getString('speed') || 'normal';

    // Resolve the source image URL
    let url;
    let label;
    if (attachment) {
      if (!attachment.contentType?.startsWith('image/')) {
        return interaction.reply({ content: '❌ That attachment is not an image.', flags: MessageFlags.Ephemeral });
      }
      if (attachment.size > MAX_INPUT_BYTES) {
        return interaction.reply({ content: '❌ Image is too large (max 8 MB).', flags: MessageFlags.Ephemeral });
      }
      url = attachment.url;
      label = attachment.name;
    } else {
      const target = user || interaction.user;
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      url = (member || target).displayAvatarURL({ extension: 'png', size: 512, forceStatic: true });
      label = `${member?.displayName || target.username}'s avatar`;
    }

    await interaction.deferReply();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      const img = await loadImage(buf);

      const frames = renderFrames(createCanvas, img, { effect, size, speed });
      const gif = encodeGif(frames, { loop: 0 });
      if (gif.length > 9.5 * 1024 * 1024) throw new Error('Result too large — try a smaller size.');

      const file = new AttachmentBuilder(gif, { name: `${effect}.gif` });
      await interaction.editReply({
        content: `🎞️ **${LABEL[effect]?.replace(/^\S+\s/, '') || effect}** — ${label} (${(gif.length / 1024).toFixed(0)} KB)`,
        files: [file],
      });
    } catch (err) {
      console.error('/gif failed:', err);
      await interaction.editReply({ content: `❌ Could not make that GIF: ${err.message}` });
    }
  },
};
