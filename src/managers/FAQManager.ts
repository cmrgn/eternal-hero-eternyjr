import {
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
import { logger } from '../utils/logger'
import { shouldIgnoreInteraction } from '../utils/shouldIgnoreInteraction'

export type ResolvedThread = {
  isResolved: true
  id: string
  name: string
  content: string
  tags: string[]
  url: string
}

export type OnThreadEvents = {
  [Events.ThreadCreate]: (thread: ResolvedThread) => void
  [Events.ThreadUpdate]: (thread: ResolvedThread) => void
  [Events.ThreadDelete]: (threadId: string) => void
}

export class FAQManager {
  #FORUM_NAME = '❓│faq-guide'

  client: Client
  guildId: string
  #threads: AnyThreadChannel[]
  #links: string[]

  #listeners = {
    [Events.ThreadCreate]: [] as OnThreadEvents[Events.ThreadCreate][],
    [Events.ThreadUpdate]: [] as OnThreadEvents[Events.ThreadUpdate][],
    [Events.ThreadDelete]: [] as OnThreadEvents[Events.ThreadDelete][],
  }

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('FAQManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')
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

  on(
    eventName: Events.ThreadCreate | Events.ThreadDelete | Events.ThreadUpdate,
    listener:
      | OnThreadEvents[Events.ThreadCreate]
      | OnThreadEvents[Events.ThreadDelete]
      | OnThreadEvents[Events.ThreadUpdate]
  ) {
    if (eventName === Events.ThreadDelete)
      this.#listeners[eventName].push(
        listener as OnThreadEvents[Events.ThreadDelete]
      )
    if (eventName === Events.ThreadUpdate)
      this.#listeners[eventName].push(
        listener as OnThreadEvents[Events.ThreadUpdate]
      )
    if (eventName === Events.ThreadCreate)
      this.#listeners[eventName].push(
        listener as OnThreadEvents[Events.ThreadCreate]
      )
  }

  async cacheThreads() {
    this.#log('info', 'Caching threads on the manager instance')
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
    this.#log('info', 'Getting guild object')
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

    this.#log('info', 'Fetching all FAQ threads', {
      active: activeThreads.length,
      archived: archivedThreads.length,
      total: threads.length,
    })

    return threads
  }

  getFAQForum(guild: Guild) {
    this.#log('info', 'Getting FAQ forum')
    const faq = guild.channels.cache.find(
      ({ name }) => name === this.#FORUM_NAME
    )
    if (!faq) throw new Error('Could not find the FAQ forum.')
    return faq as ForumChannel
  }

  belongsToFAQ({ parentId, guild }: { parentId: string | null; guild: Guild }) {
    return parentId === this.getFAQForum(guild)?.id
  }

  async onThreadCreate(thread: AnyThreadChannel) {
    if (shouldIgnoreInteraction(thread)) return
    if (this.belongsToFAQ(thread)) {
      this.#log('info', 'Responding to thread creation', { id: thread.id })
      this.cacheThreads()
      const resolvedThread = await this.resolveThread(thread)
      for (const listener of this.#listeners[Events.ThreadCreate]) {
        listener(resolvedThread)
      }
    }
  }

  async onThreadDelete(thread: AnyThreadChannel) {
    if (shouldIgnoreInteraction(thread)) return
    if (this.belongsToFAQ(thread)) {
      this.#log('info', 'Responding to thread deletion', { id: thread.id })
      this.cacheThreads()
      for (const listener of this.#listeners[Events.ThreadDelete]) {
        listener(thread.id)
      }
    }
  }

  async onThreadUpdate(prev: AnyThreadChannel, next: AnyThreadChannel) {
    if (shouldIgnoreInteraction(next)) return
    if (this.belongsToFAQ(prev) && prev.name !== next.name) {
      this.#log('info', 'Responding to thread update', {
        id: next.id,
        property: 'name',
      })
      this.cacheThreads()
      const resolvedThread = await this.resolveThread(next)
      for (const listener of this.#listeners[Events.ThreadUpdate]) {
        listener(resolvedThread)
      }
    }
  }

  async onMessageUpdate(
    _: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) {
    if (shouldIgnoreInteraction(newMessage)) return
    if (newMessage.partial) newMessage = await newMessage.fetch()

    const { guild } = newMessage
    if (!guild) return

    // Retrieve the thread the message belongs to, abort if not found
    const thread = await guild.channels.fetch(newMessage.id).catch(() => null)
    if (!thread?.isThread()) return

    // Make sure the parent of the thread is the FAQ forum, abort if not
    if (this.belongsToFAQ({ parentId: thread.parent?.id ?? null, guild })) {
      this.#log('info', 'Responding to thread update', {
        id: thread.id,
        property: 'content',
      })
      const resolvedThread = await this.resolveThread(thread)
      for (const listener of this.#listeners[Events.ThreadUpdate]) {
        listener(resolvedThread)
      }
    }
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

  async resolveThread(
    thread: AnyThreadChannel | ResolvedThread
  ): Promise<ResolvedThread> {
    if ('isResolved' in thread && thread.isResolved) return thread
    this.#log('info', 'Resolving thread', { id: thread.id })

    const firstMessage = await (
      thread as AnyThreadChannel
    ).fetchStarterMessage()

    return {
      isResolved: true,
      id: thread.id,
      name: thread.name,
      content: firstMessage?.content ?? '',
      tags: this.getThreadTags(thread as AnyThreadChannel),
      url: thread.url,
    }
  }

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')
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
