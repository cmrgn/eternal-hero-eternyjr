import { EmbedBuilder } from 'discord.js'
import { BOT_COLOR } from '../config'

export const createEmbed = () =>
  new EmbedBuilder()
    .setColor(BOT_COLOR)
    .setThumbnail('https://ehmb.netlify.app/eh_icon.png')
    .setTimestamp()
