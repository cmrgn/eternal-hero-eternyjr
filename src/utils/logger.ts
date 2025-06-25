import type { Giveaway } from 'discord-giveaways'

import type { ChatInputCommandInteraction } from 'discord.js'
import { formatUser } from './formatUser'

const command = (
  interaction: ChatInputCommandInteraction,
  message: string,
  extra?: Record<PropertyKey, unknown>
) => {
  const guild = interaction.guild
  const channel = guild?.channels.cache.find(
    channel => channel.id === interaction.channelId
  )

  console.log(`[Command: ${interaction.commandName}]`, message, {
    ...extra,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: channel?.id,
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

export const LOG_SEVERITIES = ['info', 'warn', 'error'] as const

const log =
  (scope: string, severityThreshold: number) =>
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  (type: (typeof LOG_SEVERITIES)[number], message: string, ...args: any[]) => {
    if (LOG_SEVERITIES.indexOf(type) >= severityThreshold)
      console[type](`[${scope}]`, message, ...args)
  }

export const logger = {
  LOG_SEVERITIES,
  log,
  command,
  info,
  giveaway,
  utils: { formatUser },
}
