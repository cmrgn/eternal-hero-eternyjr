import type { GuildBasedChannel, Message } from 'discord.js'
import type { InteractionLike } from '../events/messageCreate'

export async function getChannelFromInteraction(interaction: InteractionLike) {
  const { guild, channel } = interaction

  return (
    guild?.channels.cache.find(({ id }) => id === channel.id) ??
    ((await interaction.client.channels.fetch(channel.id)) as GuildBasedChannel)
  )
}
