import {
  type Client,
  Events,
  type Message,
  type OmitPartialGroupDMChannel,
  type PartialMessage,
} from 'discord.js'

import { pool } from '../utils/pg'
import { logger } from '../utils/logger'

type DiscordMessage = OmitPartialGroupDMChannel<
  Message<boolean> | PartialMessage
>

export class LeaderboardManager {
  #client: Client

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('LeaderboardManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')
    this.#client = client
  }

  isLeaderboardEnabled() {
    const { Flags } = this.#client.managers
    return Flags.getFeatureFlag('faq_leaderboard', { silent: true })
  }

  async register(options: {
    userId: string
    guildId: string
    channelId: string
    messageId?: string
    increment?: number
  }) {
    const { Discord } = this.#client.managers

    this.#log('info', 'Registering contribution', options)

    const { userId, guildId, channelId, increment = 1 } = options
    try {
      await pool.query(
        `
          INSERT INTO faq_leaderboard (guild_id, user_id, contribution_count)
          VALUES ($1, $2, GREATEST($3, 0))
          ON CONFLICT (guild_id, user_id)
          DO UPDATE SET contribution_count = GREATEST(faq_leaderboard.contribution_count + $3, 0)
        `,
        [guildId, userId, increment]
      )
    } catch (error) {
      await Discord.sendInteractionAlert(
        { client: this.#client, guildId, channelId, userId },
        `A link to the FAQ failed to be properly recorded in the database.\`\`\`${error}\`\`\``
      )

      this.#log('error', 'Failed to record contribution', {
        ...options,
        error,
      })
    }
  }

  async getLeaderboard(guildId: string, limit: number) {
    this.#log('info', 'Retrieving leaderboard', { guildId, limit })

    const { rows } = await pool.query(
      `
        SELECT user_id, contribution_count
        FROM faq_leaderboard
        WHERE guild_id = $1
        ORDER BY contribution_count DESC
        LIMIT $2
      `,
      [guildId, limit]
    )

    return rows as { user_id: string; contribution_count: number }[]
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
      return this.#log('info', 'FAQ leaderboard is disabled; aborting.')
    }

    // Perform a quick and cheap check to figure out whether the message
    // contains any link whatsoever, otherwise return early.
    if (!Faq.containsLinkLike(content)) return
    if (!Faq.links.some(link => content.includes(link))) return

    const hasAddedMessage = event === Events.MessageCreate
    const hasDeletedMessage = event === Events.MessageDelete
    const increment = hasAddedMessage ? +1 : hasDeletedMessage ? -1 : 0

    if (increment)
      this.register({
        userId: member.id,
        guildId,
        channelId,
        messageId: message.id,
        increment,
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

  async faqLinksOnUpdate(
    oldMessage: DiscordMessage,
    newMessage: DiscordMessage
  ) {
    const { client, guildId, channelId, member } = newMessage
    const { Faq, Discord } = client.managers

    if (!member || !guildId) return
    if (Discord.shouldIgnoreInteraction(newMessage)) return

    // Perform a quick and cheap check to figure out whether the message contains
    // any link whatsoever, otherwise return early.
    const hadOldMessageLinks =
      oldMessage.content &&
      Faq.containsLinkLike(oldMessage.content) &&
      Faq.links.some(link => oldMessage.content?.includes(link))
    const hasNewMessageLinks =
      newMessage.content &&
      Faq.containsLinkLike(newMessage.content) &&
      Faq.links.some(link => newMessage.content?.includes(link))

    if (hadOldMessageLinks === hasNewMessageLinks) return
    if (!(await this.isLeaderboardEnabled())) {
      return this.#log('info', 'FAQ leaderboard is disabled; aborting.')
    }

    const hasRemovedLinks = hadOldMessageLinks && !hasNewMessageLinks
    const hasAddedLinks = !hadOldMessageLinks && hasNewMessageLinks
    const increment = hasRemovedLinks ? -1 : hasAddedLinks ? +1 : 0

    if (increment)
      this.register({
        userId: member.id,
        guildId,
        channelId,
        messageId: newMessage.id,
        increment,
      })
  }

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')

    // Look for FAQ links in any message in order to maintain the FAQ
    // leaderboard.
    this.#client.on(Events.MessageCreate, this.faqLinksOnCreate.bind(this))
    this.#client.on(Events.MessageDelete, this.faqLinksOnDelete.bind(this))
    this.#client.on(Events.MessageUpdate, this.faqLinksOnUpdate.bind(this))

    return this
  }
}
