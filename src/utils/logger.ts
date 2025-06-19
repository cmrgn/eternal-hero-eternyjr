import type { Giveaway } from 'discord-giveaways'

import type { ChatInputCommandInteraction } from 'discord.js'
import { formatUser } from './formatUser'

const command = (
  interaction: ChatInputCommandInteraction,
  extra?: Record<PropertyKey, unknown>
) => {
  const guild = interaction.guild
  const channel = guild?.channels.cache.find(
    channel => channel.id === interaction.channelId
  )

  console.log('COMMAND', {
    ...extra,
    user: formatUser(interaction.user),
    channel: { name: channel?.name, id: interaction.channelId },
    command: interaction.commandName,
    arguments: interaction.options.data,
  })
}

const giveaway = (
  giveaway: Giveaway,
  action: string,
  extra?: Record<PropertyKey, unknown>
) => {
  console.log('GIVEAWAY', {
    ...extra,
    giveaway: { id: giveaway.messageId },
    action,
  })
}

const info = (label: string, extra?: Record<PropertyKey, unknown>) => {
  console.log(label, extra)
}

export const logger = { command, info, giveaway, utils: { formatUser } }
