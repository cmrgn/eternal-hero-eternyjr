import {
  type ThreadChannel,
  type Guild,
  Events,
  ForumChannel,
  type Client,
  type AnyThreadChannel,
  type Message,
  type PartialMessage,
} from 'discord.js'

import { DISCORD_SERVER_ID, TEST_SERVER_ID } from '../constants/discord'
import { IS_DEV } from '../constants/config'
import { logger } from './logger'

export type ResolvedThread = {
  id: string
  name: string
  createdAt: string
  content: string
  tags: string[]
  url: string
}

export class FAQManager {
  #FORUM_NAME = '❓│faq-guide'

  client: Client
  guildId: string
  #threads: AnyThreadChannel[]
  #links: string[]

  constructor(client: Client) {
    this.client = client
    // Force `guildId` to `DISCORD_SERVER_ID` to test with the real FAQ, even
    // of the test server
    this.guildId = IS_DEV
      ? (TEST_SERVER_ID ?? DISCORD_SERVER_ID)
      : DISCORD_SERVER_ID
    this.#threads = []
    this.#links = []
  }

  get threads() {
    return this.#threads
  }

  get links() {
    return this.#links
  }

  async cacheThreads() {
    this.#threads = await this.fetchThreads()
    this.#links = [
      ...this.#threads.map(thread => thread.url),
      ...this.#threads.map(thread => `<#${thread.id}>`),
    ]
  }

  containsLinkLike(content: string) {
    return (
      content.includes('<#') ||
      content.includes('https://discord.com/channels/')
    )
  }

  async getGuild() {
    const { guilds } = this.client
    return guilds.cache.get(this.guildId) ?? (await guilds.fetch(this.guildId))
  }

  async fetchThreads() {
    const guild = await this.getGuild()
    const faq = this.getFAQForum(guild)
    const [activeThreadRes, archivedThreadRes] = await Promise.all([
      faq.threads.fetchActive(),
      faq.threads.fetchArchived(),
    ])

    const activeThreads = Array.from(activeThreadRes.threads.values())
    const archivedThreads = Array.from(archivedThreadRes.threads.values())
    const threads = [...activeThreads, ...archivedThreads]

    logger.info('FETCH_THREADS', {
      active: activeThreads.length,
      archived: archivedThreads.length,
      total: threads.length,
    })

    return threads
  }

  getFAQForum(guild: Guild) {
    const faq = guild.channels.cache.find(
      ({ name }) => name === this.#FORUM_NAME
    )
    if (!faq) throw new Error('Could not find the FAQ forum.')
    return faq as ForumChannel
  }

  async onThreadCreate(thread: AnyThreadChannel) {
    const { parentId, guild, id } = thread
    const belongsToFAQ = parentId === this.getFAQForum(guild)?.id
    if (belongsToFAQ) {
      this.cacheThreads()
      await this.client.searchManager.unindexThread(id, 'en')
    }
  }

  async onThreadDelete({ id, parentId, guild }: AnyThreadChannel) {
    const belongsToFAQ = parentId === this.getFAQForum(guild)?.id
    if (belongsToFAQ) {
      this.cacheThreads()
      await this.client.searchManager.unindexThread(id, 'en')
    }
  }

  async onThreadUpdate(prev: AnyThreadChannel, next: AnyThreadChannel) {
    const { parentId, guild, name: prevName } = prev
    const { name: nextName } = next
    const belongsToFAQ = parentId === this.getFAQForum(guild)?.id
    if (belongsToFAQ && prevName !== nextName) {
      this.cacheThreads()
      await this.client.searchManager.indexThread(next, 'en')
    }
  }

  async onMessageUpdate(
    _: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) {
    if (newMessage.partial) newMessage = await newMessage.fetch()

    const { guild } = newMessage
    if (!guild) return

    // Retrieve the thread the message belongs to, abort if not found
    const thread = await guild.channels.fetch(newMessage.id).catch(() => null)
    if (!thread?.isThread()) return

    // Make sure the parent of the thread is the FAQ forum, abort if not
    const belongsToFAQ = thread.parent?.id === this.getFAQForum(guild)?.id
    if (!belongsToFAQ) return

    await this.client.searchManager.indexThread(thread, 'en')
  }

  getThreadTags(thread: AnyThreadChannel) {
    if (!(thread.parent instanceof ForumChannel)) {
      return []
    }

    return thread.appliedTags
      .map(
        id =>
          (thread.parent as ForumChannel).availableTags.find(pt => pt.id === id)
            ?.name ?? ''
      )
      .filter(Boolean)
  }

  async resolveThread(thread: AnyThreadChannel): Promise<ResolvedThread> {
    const firstMessage = await thread.fetchStarterMessage()

    return {
      id: thread.id,
      name: thread.name,
      createdAt: thread.createdAt?.toISOString() ?? '',
      content: firstMessage?.content ?? '',
      tags: this.getThreadTags(thread),
      url: thread.url,
    }
  }

  bindEvents() {
    this.client.once(Events.ClientReady, this.cacheThreads.bind(this))
    this.client.on(Events.ThreadCreate, this.onThreadCreate.bind(this))
    this.client.on(Events.ThreadDelete, this.onThreadDelete.bind(this))
    this.client.on(Events.ThreadUpdate, this.onThreadUpdate.bind(this))
    this.client.on(Events.MessageUpdate, this.onMessageUpdate.bind(this))
  }
}

export const initFAQManager = (client: Client) => {
  const manager = new FAQManager(client)
  manager.bindEvents()
  return manager
}
