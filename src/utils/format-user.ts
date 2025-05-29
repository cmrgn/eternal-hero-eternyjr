import type { ChatInputCommandInteraction } from 'discord.js'

export const formatUser = (user: ChatInputCommandInteraction['user']) => ({
  nickname: user.globalName,
  username: user.username,
  id: user.id,
})
