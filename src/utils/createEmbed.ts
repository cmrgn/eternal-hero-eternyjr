import { EmbedBuilder } from 'discord.js'

import { BOT_COLOR } from '../constants/discord'

export const createEmbed = (withThumbnail = true) => {
  const embed = new EmbedBuilder().setColor(BOT_COLOR).setTimestamp()

  if (withThumbnail) embed.setThumbnail('https://ehmb.netlify.app/eh_icon.png')

  return embed
}
