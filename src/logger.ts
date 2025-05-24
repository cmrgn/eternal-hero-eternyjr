import type { ChatInputCommandInteraction } from 'discord.js'

const formatUser = (user: ChatInputCommandInteraction['user']) => ({
  nickname: user.globalName,
  username: user.username,
  id: user.id,
})

const command = (
  interaction: ChatInputCommandInteraction,
  extra?: Record<PropertyKey, unknown>
) => {
  const guild = interaction.guild
  const channel = guild?.channels.cache.find(
    channel => channel.id === interaction.channelId
  )

  console.log('COMMAND', {
    ...extra,
    user: formatUser(interaction.user),
    channel: { name: channel?.name, id: interaction.channelId },
    command: interaction.commandName,
    arguments: interaction.options.data,
  })
}

const info = (label: string, extra?: Record<PropertyKey, unknown>) => {
  console.log(label, extra)
}

export const logger = { command, info }
