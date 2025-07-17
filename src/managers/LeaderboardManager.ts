import {
  type Client,
  Events,
  type Message,
  type OmitPartialGroupDMChannel,
  type PartialMessage,
} from 'discord.js'
import { sql } from 'kysely'
import { FAQManager } from './FAQManager'
import { LogManager, type Severity } from './LogManager'

type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean> | PartialMessage>

export class LeaderboardManager {
  #client: Client

  #logger: LogManager

  constructor(client: Client, severity: Severity = 'info') {
    this.#logger = new LogManager('LeaderboardManager', severity)
    this.#logger.log('info', 'Instantiating manager')
    this.#client = client
  }

  isLeaderboardEnabled() {
    this.#logger.log('debug', 'Ensuring the FAQ leaderboard is enabled')

    const { Flags } = this.#client.managers
    return Flags.getFeatureFlag('faq_leaderboard', { severity: 'debug' })
  }

  async register(options: {
    userId: string
    guildId: string
    channelId: string
    messageId?: string
    increment?: number
  }) {
    this.#logger.log('info', 'Registering contribution', options)

    const { Database } = this.#client.managers
    const { userId, guildId, increment = 1 } = options

    try {
      await Database.db
        .insertInto('faq_leaderboard')
        .values({
          contribution_count: sql`GREATEST(${increment}, 0)`,
          guild_id: guildId,
          user_id: userId,
        })
        .onConflict(oc =>
          oc.columns(['guild_id', 'user_id']).doUpdateSet({
            contribution_count: sql`GREATEST(faq_leaderboard.contribution_count + ${increment}, 0)`,
          })
        )
        .execute()
    } catch (error) {
      this.#logger.log('error', 'Failed to record contribution', {
        ...options,
        error,
      })
    }
  }

  async getLeaderboard(guildId: string, limit: number) {
    this.#logger.log('info', 'Retrieving leaderboard', { guildId, limit })

    const { Database } = this.#client.managers

    const results = await Database.db
      .selectFrom('faq_leaderboard')
      .select(['user_id', 'contribution_count'])
      .where('guild_id', '=', guildId)
      .orderBy('contribution_count', 'desc')
      .limit(limit)
      .execute()

    return results
  }

  async faqLinksOnCreateOrDelete(
    event: Events.MessageCreate | Events.MessageDelete,
    message: DiscordMessage
  ) {
    const { client, guildId, channelId, member, content } = message
    const { Faq, Discord } = client.managers

    if (!member || !guildId || !content) return
    if (Discord.shouldIgnoreInteraction(message)) return
    if (!(await this.isLeaderboardEnabled())) {
      return this.#logger.log('info', 'FAQ leaderboard is disabled; aborting.')
    }

    // Perform a quick and cheap check to figure out whether the message contains any link
    // whatsoever, otherwise return early.
    if (!FAQManager.containsLinkLike(content)) return
    if (!Faq.links.some(link => content.includes(link))) return

    this.#logger.log('info', 'FAQ link created or deleted', { event, messageId: message.id })

    const hasAddedMessage = event === Events.MessageCreate
    const hasDeletedMessage = event === Events.MessageDelete
    const increment = hasAddedMessage ? +1 : hasDeletedMessage ? -1 : 0

    if (increment)
      this.register({
        channelId,
        guildId,
        increment,
        messageId: message.id,
        userId: member.id,
      })
  }

  async faqLinksOnCreate(interaction: DiscordMessage) {
    const { Discord } = this.#client.managers

    if (interaction.channelId === Discord.BOT_TEST_CHANNEL_ID) return
    if (Discord.shouldIgnoreInteraction(interaction)) return

    return this.faqLinksOnCreateOrDelete(Events.MessageCreate, interaction)
  }

  faqLinksOnDelete(interaction: DiscordMessage) {
    const { Discord } = this.#client.managers

    if (interaction.channelId === Discord.BOT_TEST_CHANNEL_ID) return
    if (Discord.shouldIgnoreInteraction(interaction)) return

    return this.faqLinksOnCreateOrDelete(Events.MessageDelete, interaction)
  }

  async faqLinksOnUpdate(oldMessage: DiscordMessage, newMessage: DiscordMessage) {
    const { client, guildId, channelId, member } = newMessage
    const { Faq, Discord } = client.managers

    if (!member || !guildId) return
    if (Discord.shouldIgnoreInteraction(newMessage)) return

    // Perform a quick and cheap check to figure out whether the message contains any link
    // whatsoever, otherwise return early.
    const hadOldMessageLinks =
      oldMessage.content &&
      FAQManager.containsLinkLike(oldMessage.content) &&
      Faq.links.some(link => oldMessage.content?.includes(link))
    const hasNewMessageLinks =
      newMessage.content &&
      FAQManager.containsLinkLike(newMessage.content) &&
      Faq.links.some(link => newMessage.content?.includes(link))

    if (hadOldMessageLinks === hasNewMessageLinks) return
    if (!(await this.isLeaderboardEnabled())) {
      return this.#logger.log('info', 'FAQ leaderboard is disabled; aborting.')
    }

    const hasRemovedLinks = hadOldMessageLinks && !hasNewMessageLinks
    const hasAddedLinks = !hadOldMessageLinks && hasNewMessageLinks
    const increment = hasRemovedLinks ? -1 : hasAddedLinks ? +1 : 0

    if (increment)
      this.register({
        channelId,
        guildId,
        increment,
        messageId: newMessage.id,
        userId: member.id,
      })
  }

  bindEvents() {
    this.#logger.log('info', 'Binding events onto the manager instance')

    // Look for FAQ links in any message in order to maintain the FAQ leaderboard.
    this.#client.on(Events.MessageCreate, this.faqLinksOnCreate.bind(this))
    this.#client.on(Events.MessageDelete, this.faqLinksOnDelete.bind(this))
    this.#client.on(Events.MessageUpdate, this.faqLinksOnUpdate.bind(this))

    return this
  }
}
