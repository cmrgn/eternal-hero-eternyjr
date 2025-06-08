import {
  channelMention,
  userMention,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { ALERT_CHANNEL_ID } from '../config'
import stripIndent from 'strip-indent'

export async function alert(
  interaction: ChatInputCommandInteraction,
  message: string
) {
  const channel = await interaction.client.channels.fetch(ALERT_CHANNEL_ID)
  if (!channel?.isSendable()) return

  try {
    return channel.send(
      stripIndent(`
      ${message}

      **Context:**
      - Server: ${interaction.guild?.name ?? interaction.guildId}
      - Channel: ${channelMention(interaction.channelId)}
      - User: ${userMention(interaction.user.id)}
    `)
    )
  } catch (error) {
    console.error(error)
  }
}
