import { Logtail } from '@logtail/node'
import type { Context } from '@logtail/types'
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js'

let logtailInstance: Logtail | null = null

export const SEVERITY_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type Severity = (typeof SEVERITY_LEVELS)[number]
export type LogFunction = (
  type: (typeof SEVERITY_LEVELS)[number],
  message: string,
  context?: Context
) => void

export class LogManager {
  #severityThreshold: number
  #logtail: Logtail
  #scope: string

  constructor(scope: string, minSeverityLevel: Severity = 'info') {
    this.#scope = scope
    this.#severityThreshold = SEVERITY_LEVELS.indexOf(minSeverityLevel)

    if (logtailInstance) {
      this.#logtail = logtailInstance
    } else {
      if (!process.env.LOGTAIL_TOKEN) {
        throw new Error('Missing environment variable LOGTAIL_TOKEN; aborting.')
      }

      this.#logtail = logtailInstance = new Logtail(process.env.LOGTAIL_TOKEN, {
        endpoint: 'https://s1389943.eu-nbg-2.betterstackdata.com',
        sendLogsToConsoleOutput: true,
      })
    }
  }

  get isLogtailEnabled() {
    return process.env.NODE_ENV === 'production'
  }

  logCommand(interaction: ChatInputCommandInteraction, message: string, context?: Context) {
    const guild = interaction.guild
    const channel = guild?.channels.cache.find(channel => channel.id === interaction.channelId)
    const commandInfo = {
      arguments: interaction.options.data,
      channelId: channel?.id,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    }
    const extraContext = {
      ...context,
      ...commandInfo,
    }

    if (this.isLogtailEnabled) {
      this.#logtail.log(message, 'info', { ...extraContext, scope: `/${interaction.commandName}` })
    } else {
      console.log(`[${this.#scope}]`, `/${interaction.commandName}`, message, extraContext)
    }
  }

  logButton(interaction: ButtonInteraction, message: string, context?: Context) {
    const guild = interaction.guild
    const channel = guild?.channels.cache.find(channel => channel.id === interaction.channelId)
    const commandInfo = {
      channelId: channel?.id,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    }
    const extraContext = {
      ...context,
      ...commandInfo,
    }

    if (this.isLogtailEnabled) {
      this.#logtail.log(message, 'info', { ...extraContext, scope: interaction.component.id })
    } else {
      console.log(`[${this.#scope}]`, interaction.component.id, message, extraContext)
    }
  }

  log(severity: Severity, message: string, context?: Context) {
    if (SEVERITY_LEVELS.indexOf(severity) >= this.#severityThreshold) {
      if (this.isLogtailEnabled) {
        this.#logtail.log(message, severity, { ...context, scope: this.#scope })
      } else {
        context
          ? console[severity](`[${this.#scope}]`, message, context)
          : console[severity](`[${this.#scope}]`, message)
      }
    }
  }
}
