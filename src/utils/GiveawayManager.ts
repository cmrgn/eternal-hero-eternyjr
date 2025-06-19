import { type GiveawayData, GiveawaysManager } from 'discord-giveaways'
import type { Client } from 'discord.js'

import { BOT_COLOR } from '../constants/discord'
import { IS_DEV } from '../constants/config'
import { logger } from './logger'
import { pool } from './pg'
import { shouldIgnoreInteraction } from './shouldIgnoreInteraction'

const ENVIRONMENT = IS_DEV ? 'DEV' : 'PROD'

export const GiveawayManagerWithOwnDatabase = class extends GiveawaysManager {
  async getAllGiveaways() {
    const { rows } = await pool.query(
      'SELECT data FROM giveaways WHERE environment = $1',
      [ENVIRONMENT]
    )
    return rows.map(row => row.data)
  }

  async saveGiveaway(messageId: string, giveawayData: GiveawayData) {
    await pool.query(
      'INSERT INTO giveaways (id, data, environment) VALUES ($1, $2, $3)',
      [messageId, giveawayData, ENVIRONMENT]
    )
    return true
  }

  async editGiveaway(messageId: string, giveawayData: GiveawayData) {
    const result = await pool.query(
      'UPDATE giveaways SET data = $1 WHERE id = $2',
      [giveawayData, messageId]
    )
    return result.rowCount ? result.rowCount > 0 : false
  }

  async deleteGiveaway(messageId: string) {
    const result = await pool.query('DELETE FROM giveaways WHERE id = $1', [
      messageId,
    ])
    return result.rowCount ? result.rowCount > 0 : false
  }
}

export const initGiveawayManager = (client: Client) => {
  const manager = new GiveawayManagerWithOwnDatabase(client, {
    default: {
      botsCanWin: false,
      embedColor: BOT_COLOR,
      embedColorEnd: BOT_COLOR,
      reaction: '🎉',
      // Unless it’s run in the mod channels (for testing purposes), prevent
      // moderators from winning a giveaway.
      exemptMembers: (member, { channelId }) => {
        if (['1373605591766925412', '1262282620268576809'].includes(channelId))
          return false
        return Boolean(
          member.roles.cache.find(role => role.name === 'Community Mod')
        )
      },
    },
  })

  manager.on('giveawayReactionAdded', (giveaway, member) => {
    if (shouldIgnoreInteraction(giveaway)) return

    logger.giveaway(giveaway, 'user_entered', {
      user: logger.utils.formatUser(member.user),
    })
  })

  manager.on('giveawayReactionRemoved', (giveaway, member) => {
    if (shouldIgnoreInteraction(giveaway)) return

    logger.giveaway(giveaway, 'user_left', {
      user: logger.utils.formatUser(member.user),
    })
  })

  manager.on('giveawayRerolled', (giveaway, winners) => {
    if (shouldIgnoreInteraction(giveaway)) return

    logger.giveaway(giveaway, 'giveaway_rerolled', {
      winners: winners.map(winner => logger.utils.formatUser(winner.user)),
    })
  })

  manager.on('giveawayEnded', (giveaway, winners) => {
    if (shouldIgnoreInteraction(giveaway)) return

    logger.giveaway(giveaway, 'giveaway_ended', {
      winners: winners.map(winner => logger.utils.formatUser(winner.user)),
    })
  })

  manager.on('giveawayDeleted', giveaway => {
    if (shouldIgnoreInteraction(giveaway)) return

    logger.giveaway(giveaway, 'giveaway_deleted')
  })

  return manager
}
