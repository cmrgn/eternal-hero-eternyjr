import { Logtail } from '@logtail/node'
import type { Context } from '@logtail/types'
import type { ChatInputCommandInteraction } from 'discord.js'

const logtail = new Logtail(process.env.LOGTAIL_TOKEN ?? '', {
  endpoint: 'https://s1389943.eu-nbg-2.betterstackdata.com',
  sendLogsToConsoleOutput: true,
})

const logCommand = (
  interaction: ChatInputCommandInteraction,
  message: string,
  extra?: Record<PropertyKey, unknown>
) => {
  const guild = interaction.guild
  const channel = guild?.channels.cache.find(channel => channel.id === interaction.channelId)
  const context = {
    ...extra,
    arguments: interaction.options.data,
    channelId: channel?.id,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  }

  if (process.env.NODE_ENV === 'production') {
    logtail.log(`[Command: ${interaction.commandName}]`, message, {
      ...context,
      command: interaction.commandName,
    })
  } else {
    console.log(`[Command: ${interaction.commandName}]`, message, context)
  }
}

export const LOG_SEVERITIES = ['debug', 'info', 'warn', 'error'] as const
export type LoggerSeverity = (typeof LOG_SEVERITIES)[number]

const log =
  (scope: string, severityThreshold: number) =>
  (type: (typeof LOG_SEVERITIES)[number], message: string, context?: Context) => {
    if (LOG_SEVERITIES.indexOf(type) >= severityThreshold) {
      if (process.env.NODE_ENV === 'production') {
        logtail[type](`[${scope}] ${message}`, { ...context, scope })
      } else {
        console[type](`[${scope}] ${message}`, context)
      }
    }
  }

export const logger = {
  LOG_SEVERITIES,
  log,
  logCommand,
  logtail,
}
