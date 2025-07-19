import Bottleneck from 'bottleneck'
import { diffWords } from 'diff'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Client,
  type ColorResolvable,
  channelMention,
  EmbedBuilder,
  type Guild,
  type Message,
  type PartialMessage,
  REST,
  Routes,
  userMention,
} from 'discord.js'
import { commands } from '../commands'
import type { LanguageObject } from '../constants/i18n'
import { stripIndent } from '../utils/stripIndent'
import { withRetry } from '../utils/withRetry'
import type { ResolvedThread } from './FAQManager'
import { LogManager, type Severity } from './LogManager'

export class DiscordManager {
  #clientId: string
  #rest: REST

  #alertChannelId = '1381174240660951160'
  BOT_TEST_CHANNEL_ID = '1373605591766925412'
  DISCORD_SERVER_ID = '1239215561649426453'
  TEST_SERVER_ID = '714858253531742208'
  KITTY_USER_ID = '368097495605182483'
  static BOT_COLOR = '#ac61ff' as ColorResolvable

  #logger: LogManager

  // This is the only manager that doesn’t expect a client because it is also used outside of the
  // runtime of the bot, such as for scripts
  constructor(severity: Severity = 'info') {
    this.#logger = new LogManager('DiscordManager', severity)
    this.#logger.log('info', 'Instantiating manager')

    if (!process.env.DISCORD_CLIENT_ID) {
      throw new Error('Missing environment variable DISCORD_CLIENT_ID; aborting.')
    }

    this.#clientId = process.env.DISCORD_CLIENT_ID
    this.#rest = new REST({ version: '10' }).setToken(this.token)
  }

  get token() {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('Missing environment variable DISCORD_TOKEN; aborting.')
    }

    return process.env.DISCORD_TOKEN
  }

  get IS_DEV() {
    return process.env.NODE_ENV === 'development'
  }

  get IS_PROD() {
    return process.env.NODE_ENV === 'production'
  }

  onBotReady(client: Client<true>) {
    this.#logger.log('info', 'Discord bot is ready and logged in', {
      tag: client.user.tag,
    })
  }

  static getDiscordEditLimiter() {
    return new Bottleneck({
      reservoir: 5, // Allow 5 calls
      reservoirRefreshAmount: 5, // Refill to 5
      reservoirRefreshInterval: 5000, // Every 5 seconds
    })
  }

  async getGuild(client: Client, guildId: string) {
    this.#logger.log('info', 'Getting guild object', { guildId })

    const cachedGuild = client.guilds.cache.get(guildId)
    if (cachedGuild) return cachedGuild

    const fetchedGuild = await withRetry(
      attempt => {
        this.#logger.log('info', 'Fetching guild', { attempt, guildId })
        return client.guilds.fetch(guildId)
      },
      { logger: this.#logger }
    )

    return fetchedGuild
  }

  async confirmThreadRetranslation(
    languageObjects: LanguageObject[],
    thread: ResolvedThread,
    message: Message<boolean>,
    oldMessage: Message<boolean> | PartialMessage
  ) {
    this.#logger.log('info', 'Asking for translation confirmation', {
      id: thread.id,
    })

    const languageCount = languageObjects.length
    const char = message.content.length
    const numberFormatter = new Intl.NumberFormat('en-US')
    const currencyFormatter = new Intl.NumberFormat('en-US', {
      currency: 'EUR',
      style: 'currency',
    })
    // The previous content may not be defined if the message is a partial. We cannot refetch it,
    // because it will fetch the latest version of the mes- sage which will yield a null diff. So
    // either we have the old content in the Discord cache and we can diff, or we can’t.
    const contentDiff = oldMessage.content
      ? diffWords(oldMessage.content, message.content)
          .map(part => {
            if (part.added) return `**${part.value}**`
            if (part.removed) return `~~${part.value}~~`
            return part.value
          })
          .join('')
      : ''
    const content = [
      'You have edited a FAQ thread. Do you want to automatically translate it in all supported languages and reindex it?',
      `- Thread: _“${thread.name}”_`,
      `- Language count: ${numberFormatter.format(languageCount)} (w/o English)`,
      `- Character count: ${numberFormatter.format(char)}`,
      `- **Total cost:** ${currencyFormatter.format((20 / 1_000_000) * char * languageCount)}`,
      contentDiff.replace(/\n/g, '\n> '),
    ].join('\n')

    const row = this.confirmationComponent(
      { id: `confirm-retranslate:${thread.id}`, label: 'Yes, retranslate' },
      { id: `skip-retranslate:${thread.id}`, label: 'No, skip' }
    )

    await message.author.send({ components: [row], content })
  }

  static createEmbed(withThumbnail = true) {
    const embed = new EmbedBuilder().setColor(DiscordManager.BOT_COLOR).setTimestamp()

    if (withThumbnail) embed.setThumbnail('https://ehmb.netlify.app/eh_icon.png')

    return embed
  }

  shouldIgnoreInteraction(interaction: { guildId: string | null }) {
    // The bot is meant to be used in a guild, so if there is no guild ID, then the interaction
    // should be ignored.
    if (!interaction.guildId) return

    // Prevent the production bot from answering in the test server, and the test bot from answering
    // in any other server than the test one
    if (this.IS_PROD && interaction.guildId === this.TEST_SERVER_ID) return true
    if (this.IS_DEV && interaction.guildId !== this.TEST_SERVER_ID) return true
    return false
  }

  getChannelByName(guild: Guild | null, channelName: string) {
    return guild?.channels.cache.find(({ name }) => name === channelName) ?? null
  }

  async getChannelById(client: Client, guild: Guild | null | undefined, channelId: string) {
    if (guild) {
      const cachedChannelFromGuild = guild.channels.cache.find(({ id }) => id === channelId)
      if (cachedChannelFromGuild) return cachedChannelFromGuild
    }

    const cachedChannelFromClient = client.channels.cache.find(({ id }) => id === channelId)
    if (cachedChannelFromClient) return cachedChannelFromClient

    const fetchedChannel = await withRetry(() => client.channels.fetch(this.#alertChannelId), {
      logger: this.#logger,
    })
    return fetchedChannel
  }

  async sendInteractionAlert(interaction: ChatInputCommandInteraction, message: string) {
    const userId = interaction.user?.id
    const channel = await this.getChannelById(
      interaction.client,
      interaction.guild,
      this.#alertChannelId
    )
    if (!channel?.isSendable()) return
    if (interaction.guildId === this.TEST_SERVER_ID)
      return this.#logger.log('error', message.replace(/```/g, ''))

    try {
      return await channel.send(
        stripIndent(`
      ${message}

      **Context:**
      - Server: ${interaction.guild?.name ?? interaction.guildId}
      - Channel: ${interaction.channelId ? channelMention(interaction.channelId) : 'unknown'}
      - User: ${userId ? userMention(userId) : 'unknown'}
    `)
      )
    } catch (error) {
      this.#logger.log('error', 'Sending alert failed', { error })
    }
  }

  deployCommands(guildId: string) {
    this.#logger.log('info', 'Deploying bot commands', { guildId })
    const endpoint = Routes.applicationGuildCommands(this.#clientId, guildId)
    const body = Object.values(commands)
      .filter(
        command =>
          command.scope === 'PUBLIC' ||
          guildId === this.DISCORD_SERVER_ID ||
          guildId === this.TEST_SERVER_ID
      )
      .map(command => command.data)

    return this.#rest.put(endpoint, { body })
  }

  deployCommand(guildId: string, commandName: string) {
    this.#logger.log('info', 'Deploying bot command', { commandName, guildId })
    const endpoint = Routes.applicationGuildCommands(this.#clientId, guildId)
    const [body] = Object.values(commands)
      .filter(command => command.data.name === commandName)
      .map(command => command.data)
    return this.#rest.post(endpoint, { body })
  }

  deleteCommands(guildId: string) {
    this.#logger.log('info', 'Deleting bot commands for guild', { guildId })
    const endpoint = Routes.applicationGuildCommands(this.#clientId, guildId)
    return this.#rest.put(endpoint, { body: [] })
  }

  deleteCommand(guildId: string, commandId: string) {
    this.#logger.log('info', 'Deleting bot command for guild', {
      commandId,
      guildId,
    })
    const endpoint = Routes.applicationGuildCommand(this.#clientId, guildId, commandId)
    return this.#rest.delete(endpoint)
  }

  static toTimestamp(input: string | Date) {
    if (typeof input === 'string') {
      return `<t:${Math.round(new Date(input).valueOf() / 1000)}:d>`
    }

    return `<t:${Math.round(input.valueOf() / 1000)}:d>`
  }

  confirmationComponent(
    confirmBtn: {
      id: string
      label?: string
      style?: keyof typeof ButtonStyle
    },
    cancelBtn: { id: string; label?: string; style?: keyof typeof ButtonStyle }
  ) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmBtn.id)
        .setLabel(confirmBtn.label ?? 'Confirm')
        .setStyle(ButtonStyle[confirmBtn.style ?? 'Primary']),
      new ButtonBuilder()
        .setCustomId(cancelBtn.id)
        .setLabel(cancelBtn.label ?? 'Cancel')
        .setStyle(ButtonStyle[cancelBtn.style ?? 'Secondary'])
    )
  }
}
