import { type GiveawayData, GiveawaysManager } from 'discord-giveaways'
import type { Client } from 'discord.js'
import { BOT_COLOR } from '../config'
import { logger } from './logger'
import { pool } from './pg'

export const GiveawayManagerWithOwnDatabase = class extends GiveawaysManager {
  async getAllGiveaways() {
    const { rows } = await pool.query('SELECT data FROM giveaways')
    return rows.map(row => row.data)
  }

  async saveGiveaway(messageId: string, giveawayData: GiveawayData) {
    await pool.query('INSERT INTO giveaways (id, data) VALUES ($1, $2)', [
      messageId,
      giveawayData,
    ])
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
      // Unless it’s run in the mod channel (for testing purposes), prevent
      // moderators from winning a giveaway.
      exemptMembers: (member, giveaway) => {
        if (giveaway.channelId === '1262282620268576809') return false
        return Boolean(
          member.roles.cache.find(role => role.name === 'Community Mod')
        )
      },
    },
  })

  manager.on('giveawayReactionAdded', (giveaway, member) => {
    logger.giveaway(giveaway, 'user_entered', {
      user: logger.utils.formatUser(member.user),
    })
  })

  manager.on('giveawayReactionRemoved', (giveaway, member) => {
    logger.giveaway(giveaway, 'user_left', {
      user: logger.utils.formatUser(member.user),
    })
  })

  manager.on('giveawayRerolled', (giveaway, winners) => {
    logger.giveaway(giveaway, 'giveaway_rerolled', {
      winners: winners.map(winner => logger.utils.formatUser(winner.user)),
    })
  })

  manager.on('giveawayEnded', (giveaway, winners) => {
    logger.giveaway(giveaway, 'giveaway_ended', {
      winners: winners.map(winner => logger.utils.formatUser(winner.user)),
    })
  })

  manager.on('giveawayDeleted', giveaway => {
    logger.giveaway(giveaway, 'giveaway_deleted')
  })

  return manager
}
