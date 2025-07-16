import {
  ChannelType,
  type Message,
  type OmitPartialGroupDMChannel,
  PermissionFlagsBits,
} from 'discord.js'
import { discordLinking } from './messageCreate.discordLinking'
import { languageDetection } from './messageCreate.languageDetection'

export type TextMessageInChannel = OmitPartialGroupDMChannel<Message<boolean>>

export async function onMessageCreate(interaction: TextMessageInChannel) {
  const { guild, member, channel, client } = interaction
  const { Discord } = client.managers

  // If the interaction is incomplete, or if it comes from a bot, do nothing.
  if (!guild || !member || member.user.bot || !guild.members.me) return

  // If the bot is running neither on the official server, nor on the testing server, do nothing
  // since Discord linking and language detection may not be relevant at all.
  if (guild.id !== Discord.DISCORD_SERVER_ID && guild.id !== Discord.TEST_SERVER_ID) return

  // If the interaction should be ignored, ignore it.
  if (Discord.shouldIgnoreInteraction(interaction)) return

  // If the channel is not text-based or not sendable, do nothing.
  if (!channel.isTextBased() || !channel.isSendable()) return

  // If the channel is not a public guild channel or thread, do nothing.
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.PublicThread) return

  // If the bot is missing the permissions to post in the channel, do nothing.
  if (!channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)) return

  discordLinking(interaction)
  languageDetection(interaction, channel)
}
