import type { ChatInputCommandInteraction } from 'discord.js'

const logCommand = (
  interaction: ChatInputCommandInteraction,
  message: string,
  extra?: Record<PropertyKey, unknown>
) => {
  const guild = interaction.guild
  const channel = guild?.channels.cache.find(channel => channel.id === interaction.channelId)

  console.log(`[Command: ${interaction.commandName}]`, message, {
    ...extra,
    arguments: interaction.options.data,
    channelId: channel?.id,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  })
}

export const LOG_SEVERITIES = ['debug', 'info', 'warn', 'error'] as const
export type LoggerSeverity = (typeof LOG_SEVERITIES)[number]

const log =
  (scope: string, severityThreshold: number) =>
  // biome-ignore lint/suspicious/noExplicitAny: safe
  (type: (typeof LOG_SEVERITIES)[number], message: string, ...args: any[]) => {
    if (LOG_SEVERITIES.indexOf(type) >= severityThreshold)
      console[type](`[${scope}]`, message, ...args)
  }

export const logger = {
  LOG_SEVERITIES,
  log,
  logCommand,
}
