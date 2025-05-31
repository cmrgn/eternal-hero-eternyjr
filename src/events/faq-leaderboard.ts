import {
  Events,
  type PartialMessage,
  type Message,
  type OmitPartialGroupDMChannel,
} from 'discord.js'
import { shouldIgnoreInteraction } from '../utils/should-ignore-interaction'
import { upsertContribution } from '../commands/faqleaderboard'

type DiscordMessage = OmitPartialGroupDMChannel<
  Message<boolean> | PartialMessage
>

function faqLinksOnCreateOrDelete(
  event: Events.MessageCreate | Events.MessageDelete
) {
  return async (message: DiscordMessage) => {
    const { member, content, client, guildId } = message

    if (!member || !guildId || !content) return
    if (shouldIgnoreInteraction(message)) return

    // Perform a quick and cheap check to figure out whether the message contains
    // any link whatsoever, otherwise return early.
    if (!content.includes('<#')) return

    if (client.faqManager.links.some(link => content.includes(link))) {
      const hasAddedMessage = event === Events.MessageCreate
      const hasDeletedMessage = event === Events.MessageDelete
      const increment = hasAddedMessage ? +1 : hasDeletedMessage ? -1 : 0

      upsertContribution(member.id, guildId, increment)
    }
  }
}

export function faqLinksOnCreate(interaction: DiscordMessage) {
  return faqLinksOnCreateOrDelete(Events.MessageCreate)(interaction)
}

export function faqLinksOnDelete(interaction: DiscordMessage) {
  return faqLinksOnCreateOrDelete(Events.MessageDelete)(interaction)
}

export function faqLinksOnUpdate(
  oldMessage: DiscordMessage,
  newMessage: DiscordMessage
) {
  const { client, guildId, member } = newMessage

  if (!member || !guildId) return
  if (shouldIgnoreInteraction(newMessage)) return

  // Perform a quick and cheap check to figure out whether the message contains
  // any link whatsoever, otherwise return early.
  const hadOldMessageLinks =
    oldMessage.content?.includes('<#') &&
    client.faqManager.links.some(link => oldMessage.content?.includes(link))
  const hasNewMessageLinks =
    newMessage.content?.includes('<#') &&
    client.faqManager.links.some(link => newMessage.content?.includes(link))

  if (hadOldMessageLinks !== hasNewMessageLinks) {
    const hasRemovedLinks = hadOldMessageLinks && !hasNewMessageLinks
    const hasAddedLinks = !hadOldMessageLinks && hasNewMessageLinks
    const increment = hasRemovedLinks ? -1 : hasAddedLinks ? +1 : 0

    upsertContribution(member.id, guildId, increment)
  }
}
