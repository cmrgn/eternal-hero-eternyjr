import {
  type Guild,
  Events,
  ForumChannel,
  type Client,
  type AnyThreadChannel,
  type Message,
  type PartialMessage,
} from 'discord.js'

import { logger } from '../utils/logger'
import { withRetry } from '../utils/withRetry'

export type ResolvedThread = {
  isResolved: true
  id: string
  name: string
  messages: { content: string; id: string }[]
  content: string
  tags: string[]
  url: string
}

export type ThreadEvents = {
  ThreadCreated: (thread: ResolvedThread) => void
  ThreadNameUpdated: (thread: ResolvedThread) => void
  ThreadContentUpdated: (
    thread: ResolvedThread,
    newMessage: Message,
    oldMessage: Message | PartialMessage
  ) => void
  ThreadDeleted: (threadId: string) => void
}

export class FAQManager {
  #client: Client
  guildId: string

  #threads: AnyThreadChannel[]
  #links: string[]
  #tocId = '1315713544058310707'

  #listeners = {
    ThreadCreated: [] as ThreadEvents['ThreadCreated'][],
    ThreadNameUpdated: [] as ThreadEvents['ThreadNameUpdated'][],
    ThreadContentUpdated: [] as ThreadEvents['ThreadContentUpdated'][],
    ThreadDeleted: [] as ThreadEvents['ThreadDeleted'][],
  }

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('FAQManager', this.#severityThreshold)

  constructor(client: Client) {
    const { Discord } = client.managers

    this.#log('info', 'Instantiating manager')
    this.#client = client
    // Force `guildId` to `DISCORD_SERVER_ID` to test with the real FAQ, even
    // of the test server
    this.guildId = Discord.IS_DEV
      ? (Discord.TEST_SERVER_ID ?? Discord.DISCORD_SERVER_ID)
      : Discord.DISCORD_SERVER_ID
    this.#threads = []
    this.#links = []
  }

  get threads() {
    return this.#threads
  }

  get links() {
    return this.#links
  }

  on(eventName: 'ThreadCreated', listener: ThreadEvents['ThreadCreated']): void
  on(eventName: 'ThreadDeleted', listener: ThreadEvents['ThreadDeleted']): void
  on(
    eventName: 'ThreadNameUpdated',
    listener: ThreadEvents['ThreadNameUpdated']
  ): void
  on(
    eventName: 'ThreadContentUpdated',
    listener: ThreadEvents['ThreadContentUpdated']
  ): void
  on(
    eventName: keyof ThreadEvents,
    listener:
      | ThreadEvents['ThreadCreated']
      | ThreadEvents['ThreadDeleted']
      | ThreadEvents['ThreadNameUpdated']
      | ThreadEvents['ThreadContentUpdated']
  ) {
    switch (eventName) {
      case 'ThreadCreated':
        return this.#listeners[eventName].push(
          listener as ThreadEvents['ThreadCreated']
        )
      case 'ThreadDeleted':
        return this.#listeners[eventName].push(
          listener as ThreadEvents['ThreadDeleted']
        )
      case 'ThreadNameUpdated':
        return this.#listeners[eventName].push(
          listener as ThreadEvents['ThreadNameUpdated']
        )
      case 'ThreadContentUpdated':
        return this.#listeners[eventName].push(
          listener as ThreadEvents['ThreadContentUpdated']
        )
    }
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
    const { guilds } = this.#client
    return (
      guilds.cache.get(this.guildId) ??
      (await withRetry(() => guilds.fetch(this.guildId)))
    )
  }

  async fetchThreads() {
    const guild = await this.getGuild()
    const faq = this.getFAQForum(guild)
    const [activeThreadRes, archivedThreadRes] = await Promise.all([
      faq.threads.fetchActive(),
      faq.threads.fetchArchived(),
    ])

    // Ignore the pinned thread used as a table of contents since there is no
    // point in translating or indexing it.
    const activeThreads = Array.from(activeThreadRes.threads.values()).filter(
      thread => thread.id !== this.#tocId
    )
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
    const faq = guild.channels.cache.find(({ name }) => name === '❓│faq-guide')
    if (!faq) throw new Error('Could not find the FAQ forum.')
    return faq as ForumChannel
  }

  belongsToFAQ({ parentId, guild }: { parentId: string | null; guild: Guild }) {
    return parentId === this.getFAQForum(guild)?.id
  }

  async onThreadCreate(thread: AnyThreadChannel) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(thread)) return
    if (!this.belongsToFAQ(thread)) return

    this.#log('info', 'Responding to thread creation', { id: thread.id })
    this.cacheThreads()

    const resolvedThread = await this.resolveThread(thread)
    for (const listener of this.#listeners.ThreadCreated)
      listener(resolvedThread)
  }

  async onThreadDelete(thread: AnyThreadChannel) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(thread)) return
    if (!this.belongsToFAQ(thread)) return

    this.#log('info', 'Responding to thread deletion', { id: thread.id })
    this.cacheThreads()

    for (const listener of this.#listeners.ThreadDeleted) listener(thread.id)
  }

  async onThreadUpdate(prev: AnyThreadChannel, next: AnyThreadChannel) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(next)) return
    if (!this.belongsToFAQ(prev)) return
    if (prev.name === next.name) return

    this.#log('info', 'Responding to thread name update', { id: next.id })
    this.cacheThreads()

    const resolvedThread = await this.resolveThread(next)
    for (const listener of this.#listeners.ThreadNameUpdated)
      listener(resolvedThread)
  }

  async onMessageUpdate(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(newMessage)) return
    if (newMessage.partial)
      newMessage = await withRetry(() => newMessage.fetch())

    const { guild } = newMessage
    if (!guild) return

    // Retrieve the thread the message belongs to, abort if not found
    const thread = await guild.channels.fetch(newMessage.id).catch(() => null)
    if (!thread?.isThread()) return

    // Make sure the parent of the thread is the FAQ forum, abort if not
    if (!this.belongsToFAQ({ parentId: thread.parent?.id ?? null, guild }))
      return

    this.#log('info', 'Responding to thread content update', {
      id: thread.id,
    })

    // If the old content is accessible in the Discord cache and strictly
    // equal to the new content after normalization, do nothing since the edit
    // is essentially moot
    if (
      this.cleanUpThreadContent(oldMessage.content) ===
      this.cleanUpThreadContent(newMessage.content)
    ) {
      return this.#log('info', 'Content unchanged; ignoring thread update', {
        id: thread.id,
      })
    }

    const resolvedThread = await this.resolveThread(thread)
    for (const listener of this.#listeners.ThreadContentUpdated)
      listener(resolvedThread, newMessage, oldMessage)
  }

  getThreadTags(thread: AnyThreadChannel) {
    const { parent, appliedTags } = thread

    if (!(parent instanceof ForumChannel)) return []

    return appliedTags
      .map(
        id =>
          (parent as ForumChannel).availableTags.find(t => t.id === id)?.name ??
          ''
      )
      .filter(Boolean)
  }

  cleanUpThreadContent(content?: string | null) {
    return (
      (content ?? '')
        // Removed the related entries footer from the message
        .split(/> Related entr(?:y|ies):/)[0]
        // Remove emojis
        .replace(/<a?:\w+:\d+>/g, '')
        .replace(/:[a-zA-Z0-9_]+:/g, '')
        // Remove bold markers
        .replace(/\*\*/g, '')
        // Collapse successive double spaces into a single one
        .replace(/ +/g, ' ')
        .trim()
    )
  }

  async resolveThreadMessage(thread: AnyThreadChannel) {
    const firstMessage = await withRetry(() => thread.fetchStarterMessage())

    return [
      {
        content: this.cleanUpThreadContent(firstMessage?.content),
        id: thread.id,
      },
    ]
  }

  async resolveThreadMessages(
    thread: AnyThreadChannel,
    { skipFirst }: { skipFirst: boolean }
  ) {
    const messages = await withRetry(() => thread.messages.fetch())

    return (
      Array.from(messages.values())
        // Messages come in reverse chronological order, so reverse the list
        .reverse()
        // Drop the very first message (which may be a ToC) if needed
        .filter(message => (skipFirst ? message.id !== thread.id : true))
        // Clean up each message individually
        .map(message => ({
          content: this.cleanUpThreadContent(message.content),
          id: message.id,
        }))
    )
  }

  async resolveThread(thread: AnyThreadChannel): Promise<ResolvedThread> {
    this.#log('info', 'Resolving thread', { id: thread.id })

    const BEGINNER_GUIDE = '1324842936281595904'
    const BEGINNER_GUIDE_DEV = '1392774418651938846'
    const UPGRADE_ORDER = '1315710373374197850'
    // This is a bit of a hack for the beginner guide since it is spread over
    // multiple messages, and all of it should be index.
    const isBeginnerGuide =
      thread.id === BEGINNER_GUIDE || thread.id === BEGINNER_GUIDE_DEV
    const hasMultiplePosts = isBeginnerGuide || thread.id === UPGRADE_ORDER
    const messages = hasMultiplePosts
      ? await this.resolveThreadMessages(thread, { skipFirst: isBeginnerGuide })
      : await this.resolveThreadMessage(thread)

    return {
      isResolved: true,
      id: thread.id,
      name: thread.name,
      messages: messages,
      content: messages.map(message => message.content).join('\n'),
      tags: this.getThreadTags(thread),
      url: thread.url,
    }
  }

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')

    this.#client.once(Events.ClientReady, this.cacheThreads.bind(this))
    this.#client.on(Events.ThreadCreate, this.onThreadCreate.bind(this))
    this.#client.on(Events.ThreadDelete, this.onThreadDelete.bind(this))
    this.#client.on(Events.ThreadUpdate, this.onThreadUpdate.bind(this))
    this.#client.on(Events.MessageUpdate, this.onMessageUpdate.bind(this))

    return this
  }
}
