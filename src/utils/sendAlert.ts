import {
  channelMention,
  type Client,
  type Guild,
  type User,
  userMention,
} from 'discord.js'
import { ALERT_CHANNEL_ID } from '../config'
import stripIndent from 'strip-indent'

export type InteractionLike = {
  client: Client
  guild?: Guild | null
  guildId: string | null
  channelId?: string
  user?: User | null
  userId?: string | null
}

export async function sendAlert(interaction: InteractionLike, message: string) {
  const userId = interaction.user?.id ?? interaction.userId
  const channel = await interaction.client.channels.fetch(ALERT_CHANNEL_ID)
  if (!channel?.isSendable()) return

  try {
    return channel.send(
      stripIndent(`
      ${message}

      **Context:**
      - Server: ${interaction.guild?.name ?? interaction.guildId}
      - Channel: ${interaction.channelId ? channelMention(interaction.channelId) : 'unknown'}
      - User: ${userId ? userMention(userId) : 'unknown'}
    `)
    )
  } catch (error) {
    console.error(error)
  }
}
