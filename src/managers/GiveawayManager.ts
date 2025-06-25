import { type GiveawayData, GiveawaysManager } from 'discord-giveaways'
import type { Client } from 'discord.js'

import { shouldIgnoreInteraction } from '../utils/shouldIgnoreInteraction'
import { BOT_COLOR } from '../constants/discord'
import { IS_DEV } from '../constants/config'
import { logger } from '../utils/logger'
import { pool } from '../utils/pg'

const ENVIRONMENT = IS_DEV ? 'DEV' : 'PROD'

const severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
const log = logger.log('GiveawayManager', severityThreshold)

export const GiveawayManagerWithOwnDatabase = class extends GiveawaysManager {
  async getAllGiveaways() {
    log('info', 'Fetching all giveaways from the database')

    const { rows } = await pool.query(
      'SELECT data FROM giveaways WHERE environment = $1',
      [ENVIRONMENT]
    )

    return rows.map(row => row.data)
  }

  async saveGiveaway(messageId: string, giveawayData: GiveawayData) {
    log('info', 'Saving a giveaway in the database', {
      messageId,
      giveawayData,
    })

    await pool.query(
      'INSERT INTO giveaways (id, data, environment) VALUES ($1, $2, $3)',
      [messageId, giveawayData, ENVIRONMENT]
    )
    return true
  }

  async editGiveaway(messageId: string, giveawayData: GiveawayData) {
    log('info', 'Editing a giveaway from the database', {
      messageId,
      giveawayData,
    })

    const result = await pool.query(
      'UPDATE giveaways SET data = $1 WHERE id = $2',
      [giveawayData, messageId]
    )

    return result.rowCount ? result.rowCount > 0 : false
  }

  async deleteGiveaway(messageId: string) {
    log('info', 'Deleting a giveaway from the database', { messageId })

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

    log('info', 'User entered giveaway', {
      messageId: giveaway.messageId,
      userId: member.user.id,
    })
  })

  manager.on('giveawayReactionRemoved', (giveaway, member) => {
    if (shouldIgnoreInteraction(giveaway)) return

    log('info', 'User left giveaway', {
      messageId: giveaway.messageId,
      userId: member.user.id,
    })
  })

  manager.on('giveawayRerolled', (giveaway, winners) => {
    if (shouldIgnoreInteraction(giveaway)) return

    log('info', 'Giveaway rerolled', {
      messageId: giveaway.messageId,
      winners: winners.map(winner => winner.id),
    })
  })

  manager.on('giveawayEnded', (giveaway, winners) => {
    if (shouldIgnoreInteraction(giveaway)) return

    log('info', 'Giveaway ended', {
      messageId: giveaway.messageId,
      winners: winners.map(winner => winner.id),
    })
  })

  manager.on('giveawayDeleted', giveaway => {
    if (shouldIgnoreInteraction(giveaway)) return

    log('info', 'Giveaway deleted', {
      messageId: giveaway.messageId,
    })
  })

  return manager
}
