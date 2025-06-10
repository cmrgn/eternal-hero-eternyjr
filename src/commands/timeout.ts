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
import { logger } from '../utils/logger'
import { RULES_CHOICES } from './rule'
import ms, { type StringValue } from 'ms'

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

  logger.command(interaction)

  if (!interaction.guild) throw new Error('Cannot retrieve guild.')
  if (!member) throw new Error('Cannot retrieve member.')
  if (durationMs === 0) throw new Error('Cannot time out a user for 0ms.')

  // Time out the user
  await member.timeout(durationMs, `Violating rule ${rule}`)

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const channels = interaction.guild!.channels
  const moderation = channels.cache.find(
    channel => channel.name === '🔨│moderation'
  )

  const [number, label] = rule.split(': ')
  const message = `${userMention(member.id)} was timed out for ${ms(durationMs)} for violating ${bold(number.toLocaleLowerCase())} (${label}).`

  // Announce the timeout
  if (moderation?.isSendable()) await moderation.send(message)

  // Confirm the timeout action was taken
  return interaction.reply({ content: message, flags: MessageFlags.Ephemeral })
}
