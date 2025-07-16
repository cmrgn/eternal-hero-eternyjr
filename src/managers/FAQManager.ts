import {
  type AnyThreadChannel,
  type ButtonInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  Events,
  type ForumChannel,
  type ForumThreadChannel,
  type Guild,
  type Message,
  type PartialMessage,
} from 'discord.js'

import { type LoggerSeverity, logger } from '../utils/logger'
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

const FAQ_FORUM_ID_DEV = '1373344771552317532'
const FAQ_FORUM_ID_PROD = '1315703328264425543'

export type FAQForumThreadChannel =
  | (ForumThreadChannel & { parentId: typeof FAQ_FORUM_ID_DEV })
  | (ForumThreadChannel & { parentId: typeof FAQ_FORUM_ID_PROD })

export class FAQManager {
  #client: Client

  #threads: FAQForumThreadChannel[]
  #links: string[]
  #faqForum: ForumChannel | null = null

  #specialThreads = {
    MULTI_POSTS_WITH_TOC: ['1324842936281595904', '1392774418651938846'],
    MULTI_POSTS_WITHOUT_TOC: ['1315710373374197850'],
    TABLE_OF_CONTENTS: '1315713544058310707',
  }

  #listeners: {
    ThreadContentUpdated: ThreadEvents['ThreadContentUpdated'][]
    ThreadCreated: ThreadEvents['ThreadCreated'][]
    ThreadDeleted: ThreadEvents['ThreadDeleted'][]
    ThreadNameUpdated: ThreadEvents['ThreadNameUpdated'][]
  } = {
    ThreadContentUpdated: [],
    ThreadCreated: [],
    ThreadDeleted: [],
    ThreadNameUpdated: [],
  }

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('FAQManager', this.#severityThreshold)

  constructor(client: Client, severity: LoggerSeverity = 'info') {
    this.#severityThreshold = logger.LOG_SEVERITIES.indexOf(severity)
    this.#log('debug', 'Instantiating manager')

    this.#client = client
    this.#threads = []
    this.#links = []
  }

  static containsLinkLike(content: string) {
    return content.includes('<#') || content.includes('https://discord.com/channels/')
  }

  get guildId() {
    const { Discord } = this.#client.managers
    if (Discord.IS_DEV && Discord.TEST_SERVER_ID) return Discord.TEST_SERVER_ID
    return Discord.DISCORD_SERVER_ID
  }

  get faqForumId() {
    const { Discord } = this.#client.managers
    if (Discord.IS_DEV && Discord.TEST_SERVER_ID) return FAQ_FORUM_ID_DEV
    return FAQ_FORUM_ID_PROD
  }

  get threads() {
    return this.#threads
  }

  get links() {
    return this.#links
  }

  on(eventName: 'ThreadCreated', listener: ThreadEvents['ThreadCreated']): void
  on(eventName: 'ThreadDeleted', listener: ThreadEvents['ThreadDeleted']): void
  on(eventName: 'ThreadNameUpdated', listener: ThreadEvents['ThreadNameUpdated']): void
  on(eventName: 'ThreadContentUpdated', listener: ThreadEvents['ThreadContentUpdated']): void
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
        return this.#listeners[eventName].push(listener as ThreadEvents['ThreadCreated'])
      case 'ThreadDeleted':
        return this.#listeners[eventName].push(listener as ThreadEvents['ThreadDeleted'])
      case 'ThreadNameUpdated':
        return this.#listeners[eventName].push(listener as ThreadEvents['ThreadNameUpdated'])
      case 'ThreadContentUpdated':
        return this.#listeners[eventName].push(listener as ThreadEvents['ThreadContentUpdated'])
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

  async fetchThreads() {
    this.#log('debug', 'Fetching all FAQ threads', { guildId: this.guildId })

    const { Discord } = this.#client.managers
    const guild = await Discord.getGuild(this.#client, this.guildId)
    const faq = this.getFaqForum(guild)

    const [activeThreadRes, archivedThreadRes] = await Promise.all([
      withRetry(attempt => {
        this.#log('debug', 'Fetching active threads', { attempt, forumId: faq.id })
        return faq.threads.fetchActive()
      }),
      withRetry(attempt => {
        this.#log('debug', 'Fetching inactive threads', { attempt, forumId: faq.id })
        return faq.threads.fetchArchived()
      }),
    ])

    // Ignore the pinned thread used as a table of contents since there is no point in translating
    // or indexing it.
    const activeThreads = Array.from(activeThreadRes.threads.values()).filter(
      thread => thread.id !== this.#specialThreads.TABLE_OF_CONTENTS
    )
    const archivedThreads = Array.from(archivedThreadRes.threads.values())
    const threads = [...activeThreads, ...archivedThreads]

    this.#log('info', 'Fetched all FAQ threads', {
      active: activeThreads.length,
      archived: archivedThreads.length,
      total: threads.length,
    })

    return threads as FAQForumThreadChannel[]
  }

  getResolvedThreads() {
    return Promise.all(this.#threads.map(thread => this.#resolveThread(thread)))
  }

  getFaqForum(guild: Guild) {
    if (this.#faqForum) {
      this.#log('debug', 'Returning FAQ forum from cache', {
        channelId: this.#faqForum.id,
        guildId: guild.id,
      })

      return this.#faqForum
    }

    this.#log('info', 'Retrieving FAQ forum', { channelId: this.faqForumId, guildId: guild.id })

    const faq = guild.channels.cache.find(({ id }) => id === this.faqForumId)

    if (faq?.type !== ChannelType.GuildForum) {
      throw new Error(`Could not find a valid FAQ forum.`)
    }

    this.#faqForum = faq

    return this.#faqForum
  }

  isWithinFAQ(thread: AnyThreadChannel): thread is FAQForumThreadChannel {
    return thread.parentId === this.faqForumId
  }

  async onThreadCreate(thread: AnyThreadChannel) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(thread)) return
    if (!this.isWithinFAQ(thread)) return

    this.#log('info', 'Responding to thread creation', { id: thread.id })
    this.cacheThreads() // Note: this could be optimized

    const resolvedThread = await this.#resolveThread(thread)
    for (const listener of this.#listeners.ThreadCreated) listener(resolvedThread)
  }

  async onThreadDelete(thread: AnyThreadChannel) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(thread)) return
    if (!this.isWithinFAQ(thread)) return

    this.#log('info', 'Responding to thread deletion', { id: thread.id })
    this.cacheThreads() // Note: this could be optimized

    for (const listener of this.#listeners.ThreadDeleted) listener(thread.id)
  }

  async onThreadUpdate(prev: AnyThreadChannel, next: AnyThreadChannel) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(next)) return
    if (!this.isWithinFAQ(next)) return
    if (prev.name === next.name) return
    if (next.id === this.#specialThreads.TABLE_OF_CONTENTS) return

    this.#log('info', 'Responding to thread name update', { id: next.id })
    // Update the cache without refetching all threads; just update this one
    this.#threads = this.#threads.map(t => (t.id === next.id ? next : t))

    const resolvedThread = await this.#resolveThread(next)
    for (const listener of this.#listeners.ThreadNameUpdated) listener(resolvedThread)
  }

  async onMessageUpdate(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) {
    const { Discord } = this.#client.managers

    if (Discord.shouldIgnoreInteraction(newMessage)) return
    if (newMessage.partial) newMessage = await withRetry(() => newMessage.fetch())

    const { channel } = newMessage

    // Make sure the parent of the thread is the FAQ forum, abort if not
    if (channel.type !== ChannelType.PublicThread || !this.isWithinFAQ(channel)) return

    // If the thread is the FAQ, do nothing
    if (channel.id === this.#specialThreads.TABLE_OF_CONTENTS) return

    this.#log('info', 'Responding to thread content update', { id: channel.id })

    // If the old content is accessible in the Discord cache and strictly equal to the new content
    // after normalization, do nothing since the edit is essentially moot
    if (
      FAQManager.cleanUpThreadContent(oldMessage.content) ===
      FAQManager.cleanUpThreadContent(newMessage.content)
    ) {
      return this.#log('info', 'Content unchanged; ignoring thread update', { id: channel.id })
    }

    const resolvedThread = await this.#resolveThread(channel)
    for (const listener of this.#listeners.ThreadContentUpdated)
      listener(resolvedThread, newMessage, oldMessage)
  }

  async #resolveThreadMessage(thread: ForumThreadChannel) {
    const firstMessage = await withRetry(() => thread.fetchStarterMessage())

    return {
      content: FAQManager.cleanUpThreadContent(firstMessage?.content),
      id: thread.id,
    }
  }

  async #resolveThreadMessages(thread: ForumThreadChannel, { skipFirst }: { skipFirst: boolean }) {
    const messages = await withRetry(() => thread.messages.fetch())

    return (
      Array.from(messages.values())
        // Messages come in reverse chronological order, so reverse the list
        .reverse()
        // Drop the very first message (which may be a ToC) if needed
        .filter(message => (skipFirst ? message.id !== thread.id : true))
        // Clean up each message individually
        .map(message => ({
          content: FAQManager.cleanUpThreadContent(message.content),
          id: message.id,
        }))
    )
  }

  async #resolveThread(thread: FAQForumThreadChannel): Promise<ResolvedThread> {
    this.#log('info', 'Resolving thread', { id: thread.id })

    const { MULTI_POSTS_WITHOUT_TOC, MULTI_POSTS_WITH_TOC } = this.#specialThreads
    const hasMultiplePosts =
      MULTI_POSTS_WITHOUT_TOC.includes(thread.id) || MULTI_POSTS_WITH_TOC.includes(thread.id)
    const hasToC = MULTI_POSTS_WITH_TOC.includes(thread.id)
    const messages = hasMultiplePosts
      ? await this.#resolveThreadMessages(thread, { skipFirst: hasToC })
      : [await this.#resolveThreadMessage(thread)]
    const tags = thread.appliedTags
      .map(id => thread.parent?.availableTags.find(t => t.id === id)?.name ?? '')
      .filter(Boolean)

    return {
      content: messages.map(message => message.content).join('\n'),
      id: thread.id,
      isResolved: true,
      messages: messages,
      name: thread.name,
      tags,
      url: thread.url,
    }
  }

  async resolveThreadFromChannel(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    id: string
  ) {
    const { Discord } = this.#client.managers
    const channel = await Discord.getChannelById(interaction.client, interaction.guild, id)

    if (channel?.type !== ChannelType.PublicThread) {
      throw new Error(`Could not retrieve a valid FAQ thread for \`${id}\`.`)
    }

    if (channel.parentId !== this.faqForumId) {
      throw new Error(`Thread with \`${id}\` does not belong to the FAQ.`)
    }

    return this.#resolveThread(channel as FAQForumThreadChannel)
  }

  static cleanUpThreadContent(content?: string | null) {
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

  bindEvents() {
    this.#log('debug', 'Binding events onto the manager instance')

    this.#client.once(Events.ClientReady, this.cacheThreads.bind(this))
    this.#client.on(Events.ThreadCreate, this.onThreadCreate.bind(this))
    this.#client.on(Events.ThreadDelete, this.onThreadDelete.bind(this))
    this.#client.on(Events.ThreadUpdate, this.onThreadUpdate.bind(this))
    this.#client.on(Events.MessageUpdate, this.onMessageUpdate.bind(this))

    return this
  }
}
