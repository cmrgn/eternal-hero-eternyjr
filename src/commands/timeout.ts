import {
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

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .addUserOption(option =>
    option.setName('user').setDescription('User to time out').setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('duration')
      .setDescription('Timeout duration')
      .setMinValue(1)
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
  const duration = interaction.options.getInteger('duration', true)

  logger.command(interaction)

  if (!interaction.guild) throw new Error('Cannot retrieve guild.')
  if (!member) throw new Error('Cannot retrieve member.')

  // Time out the user
  await member.timeout(duration * 60 * 1_000, `Violating rule ${rule}`)

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const channels = interaction.guild!.channels
  const moderation = channels.cache.find(
    channel => channel.name === '🔨│moderation'
  )

  const [number, label] = rule.split(': ')
  const message = `${userMention(member.id)} was timed out for ${duration} minute${duration === 1 ? '' : 's'} for violating ${number.toLocaleLowerCase()} (${label}).`

  // Announce the timeout
  if (moderation?.isSendable()) await moderation.send(message)

  // Confirm the timeout action was taken
  return interaction.reply({ content: message, flags: MessageFlags.Ephemeral })
}
