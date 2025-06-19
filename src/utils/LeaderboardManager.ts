import {
  type Client,
  Events,
  type Message,
  type OmitPartialGroupDMChannel,
  type PartialMessage,
} from 'discord.js'

import { BOT_TEST_CHANNEL_ID } from '../config'
import { shouldIgnoreInteraction } from './shouldIgnoreInteraction'
import { pool } from './pg'
import { logger } from './logger'
import { sendAlert } from './sendAlert'

type DiscordMessage = OmitPartialGroupDMChannel<
  Message<boolean> | PartialMessage
>

export class LeaderboardManager {
  client: Client

  constructor(client: Client) {
    this.client = client
  }

  async register(options: {
    userId: string
    channelId: string
    guildId: string
    increment?: number
  }) {
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
      logger.info('FAQ_CONTRIBUTION', { status: 'success', increment, userId })
    } catch (error) {
      await sendAlert(
        { client: this.client, guildId, channelId, userId },
        `A link to the FAQ failed to be properly recorded in the database.\`\`\`${error}\`\`\``
      )

      logger.info('FAQ_CONTRIBUTION', {
        status: 'failure',
        increment,
        userId,
        error,
      })
    }
  }

  async getLeaderboard(guildId: string, limit: number) {
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

  faqLinksOnCreateOrDelete(event: Events.MessageCreate | Events.MessageDelete) {
    return async (message: DiscordMessage) => {
      const { client, guildId, channelId, member, content } = message

      if (!member || !guildId || !content) return
      if (shouldIgnoreInteraction(message)) return

      // Perform a quick and cheap check to figure out whether the message
      // contains any link whatsoever, otherwise return early.
      if (!client.faqManager.containsLinkLike(content)) return

      if (client.faqManager.links.some(link => content.includes(link))) {
        const hasAddedMessage = event === Events.MessageCreate
        const hasDeletedMessage = event === Events.MessageDelete
        const increment = hasAddedMessage ? +1 : hasDeletedMessage ? -1 : 0

        if (increment)
          this.register({ userId: member.id, guildId, channelId, increment })
      }
    }
  }

  async faqLinksOnCreate(interaction: DiscordMessage) {
    const isTestChannel = interaction.channelId === BOT_TEST_CHANNEL_ID
    if (isTestChannel) return

    return this.faqLinksOnCreateOrDelete(Events.MessageCreate)(interaction)
  }

  faqLinksOnDelete(interaction: DiscordMessage) {
    return this.faqLinksOnCreateOrDelete(Events.MessageDelete)(interaction)
  }

  faqLinksOnUpdate(oldMessage: DiscordMessage, newMessage: DiscordMessage) {
    const { client, guildId, channelId, member } = newMessage

    if (!member || !guildId) return
    if (shouldIgnoreInteraction(newMessage)) return

    // Perform a quick and cheap check to figure out whether the message contains
    // any link whatsoever, otherwise return early.
    const hadOldMessageLinks =
      oldMessage.content &&
      client.faqManager.containsLinkLike(oldMessage.content) &&
      client.faqManager.links.some(link => oldMessage.content?.includes(link))
    const hasNewMessageLinks =
      newMessage.content &&
      client.faqManager.containsLinkLike(newMessage.content) &&
      client.faqManager.links.some(link => newMessage.content?.includes(link))

    if (hadOldMessageLinks !== hasNewMessageLinks) {
      const hasRemovedLinks = hadOldMessageLinks && !hasNewMessageLinks
      const hasAddedLinks = !hadOldMessageLinks && hasNewMessageLinks
      const increment = hasRemovedLinks ? -1 : hasAddedLinks ? +1 : 0

      if (increment)
        this.register({ userId: member.id, guildId, channelId, increment })
    }
  }

  bindEvents() {
    // Look for FAQ links in any message in order to maintain the FAQ leaderboard.
    this.client.on(Events.MessageCreate, this.faqLinksOnCreate.bind(this))
    this.client.on(Events.MessageDelete, this.faqLinksOnDelete.bind(this))
    this.client.on(Events.MessageUpdate, this.faqLinksOnUpdate.bind(this))
  }
}

export const initLeaderboardManager = (client: Client) => {
  const leaderboardManager = new LeaderboardManager(client)
  leaderboardManager.bindEvents()
  return leaderboardManager
}
