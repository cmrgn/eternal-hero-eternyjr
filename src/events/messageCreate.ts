import type {
  Guild,
  GuildMember,
  Message,
  OmitPartialGroupDMChannel,
  TextBasedChannel,
} from 'discord.js'
import { shouldIgnoreInteraction } from '../utils/shouldIgnoreInteraction'
import { discordLinking } from './messageCreate.discordLinking'
import { languageDetection } from './messageCreate.languageDetection'

export type InteractionLike = OmitPartialGroupDMChannel<Message<boolean>>
export type EnsuredInteraction = Omit<
  InteractionLike,
  'guild' | 'member' | 'channel'
> & {
  guild: Guild
  member: GuildMember
  channel: TextBasedChannel
}

export function onMessageCreate(interaction: InteractionLike) {
  const { guild, member, channel } = interaction

  if (!channel.isTextBased()) return
  if (!guild || !member || member.user.bot) return
  if (shouldIgnoreInteraction(interaction)) return

  discordLinking(interaction as EnsuredInteraction)
  languageDetection(interaction as EnsuredInteraction)
}
