import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { BOT_COLOR, IS_DEV, IS_PROD, TEST_SERVER_ID } from './config'

export function shouldIgnoreInteraction(interaction: {
  guildId: string | null
}) {
  // Prevent the production bot from answering in the test server, and the test
  // bot from answering in any other server than the test one
  if (IS_PROD && interaction.guildId === TEST_SERVER_ID) return true
  if (IS_DEV && interaction.guildId !== TEST_SERVER_ID) return true
  return false
}

export const formatUser = (user: ChatInputCommandInteraction['user']) => ({
  nickname: user.globalName,
  username: user.username,
  id: user.id,
})

export const createEmbed = () =>
  new EmbedBuilder()
    .setColor(BOT_COLOR)
    .setThumbnail('https://ehmb.netlify.app/eh_icon.png')
    .setTimestamp()
