import {
  bold,
  type ChatInputCommandInteraction,
  type GuildMember,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from 'discord.js'
import ms, { type StringValue } from 'ms'

import { logger } from '../utils/logger'
import { RULES_CHOICES } from './rule'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .addUserOption(option =>
    option.setName('user').setDescription('User to time out').setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('duration')
      .setDescription('Timeout duration (e.g. 60s, 5mn, 1hr, 1d)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('violation')
      .setDescription('Rule violation')
      .setRequired(true)
      .setChoices(...RULES_CHOICES)
  )
  .setDescription('Time out a user for violating a rule')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

export async function execute(interaction: ChatInputCommandInteraction) {
  const rule = interaction.options.getString('violation', true)
  const member = interaction.options.getMember('user') as GuildMember
  const duration = interaction.options.getString('duration', true)
  const durationMs = ms(duration as StringValue)

  logger.logCommand(interaction, 'Starting command execution')

  if (!interaction.guild) throw new Error('Cannot retrieve guild.')
  if (!member) throw new Error('Cannot retrieve member.')
  if (durationMs === 0) throw new Error('Cannot time out a user for 0ms.')

  // Time out the user
  logger.logCommand(interaction, 'Timing out member')
  await member.timeout(durationMs, `Violating rule ${rule}`)

  // Retrieve the moderation channel
  const moderation = interaction.guild.channels.cache.find(
    channel => channel.name === '🔨│moderation'
  )

  // Prepare the moderation message
  const [number, label] = rule.split(': ')
  const message = `${userMention(member.id)} was timed out for ${ms(durationMs)} for violating ${bold(number.toLocaleLowerCase())} (${label}).`

  // Announce the timeout in the moderation channel
  if (moderation?.isSendable()) {
    logger.logCommand(interaction, 'Announcing timeout')
    await moderation.send(message)
  }

  // Confirm the timeout action was taken
  return interaction.reply({ content: message, flags: MessageFlags.Ephemeral })
}
