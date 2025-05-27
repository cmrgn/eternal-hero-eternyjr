import { Octokit } from '@octokit/rest'
import {
  type Giveaway,
  type GiveawayData,
  GiveawaysManager,
} from 'discord-giveaways'
import type { Client } from 'discord.js'
import { BOT_COLOR, GITHUB_TOKEN } from './config'
import { logger } from './logger'

const octokit = new Octokit({ auth: GITHUB_TOKEN })

function write(
  content: string,
  sha: string,
  type: 'insertion' | 'edition' | 'deletion'
) {
  logger.info('DATABASE_PING', { type })

  return octokit.repos.createOrUpdateFileContents({
    owner: 'KittySparkles',
    repo: 'eternal-hero-bot',
    path: 'storage/giveaways.json',
    message: `Update the giveaways database file (${type})`,
    content,
    sha,
  })
}

async function read() {
  logger.info('DATABASE_PING', { type: 'read' })

  const response = await octokit.repos.getContent({
    owner: 'KittySparkles',
    repo: 'eternal-hero-bot',
    path: 'storage/giveaways.json',
  })

  if (Array.isArray(response.data) || response.data.type !== 'file') {
    throw new Error('Found directory where file was expected.')
  }

  return response.data
}

const getGiveawaysFromData = (data: Awaited<ReturnType<typeof read>>) => {
  return decodeJSON(data.content)
}

function encodeJSON(content: (Giveaway | GiveawayData)[]): string {
  return Buffer.from(JSON.stringify(content)).toString('base64')
}

function decodeJSON(encodedContent: string): Giveaway[] {
  return JSON.parse(Buffer.from(encodedContent, 'base64').toString())
}

export const GiveawayManagerWithOwnDatabase = class extends GiveawaysManager {
  async getAllGiveaways() {
    try {
      const data = await read()
      const giveaways = getGiveawaysFromData(data)
      return giveaways
    } catch (error) {
      const is404 =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 404

      // This should never happen once the file is committed to the repository,
      // but just in case it happens, we return an empty array.
      if (is404) return []

      throw error
    }
  }

  async saveGiveaway(messageId: string, giveaway: GiveawayData) {
    const data = await read()
    const giveaways = getGiveawaysFromData(data)

    const content = encodeJSON([...giveaways, giveaway])
    await write(content, data.sha, 'insertion')

    return true
  }

  async editGiveaway(messageId: string, giveawayData: GiveawayData) {
    const data = await read()
    const giveaways = getGiveawaysFromData(data)

    const giveaway = giveaways.find(ga => ga.messageId === messageId)
    if (!giveaway) throw new Error('Cannot find giveaway for edition.')

    Object.assign(giveaway, giveawayData)

    const content = encodeJSON(giveaways)
    await write(content, data.sha, 'edition')

    return true
  }

  async deleteGiveaway(messageId: string) {
    const data = await read()
    const giveaways = getGiveawaysFromData(data)

    const index = giveaways.findIndex(ga => ga.messageId === messageId)
    if (index === -1) throw new Error('Cannot find giveaway for deletion.')

    giveaways.splice(index, 1)

    const content = encodeJSON(giveaways)
    await write(content, data.sha, 'deletion')

    return true
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
