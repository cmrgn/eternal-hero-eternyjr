import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('flag')
  .setDescription('Manage feature flags')
  .addSubcommand(sub =>
    sub
      .setName('enable')
      .setDescription('Enable a feature flag')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('The feature flag to enable')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('disable')
      .setDescription('Disable a feature flag')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('The feature flag to disable')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('delete')
      .setDescription('Delete a feature flag')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('The feature flag to delete')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('get')
      .setDescription('Check 1 or all feature flags')
      .addStringOption(opt =>
        opt.setName('name').setDescription('The feature flag to check')
      )
  )

  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Starting command execution')

  const { options, client } = interaction
  const { Flags } = client.managers

  const subCommand = options.getSubcommand()

  if (subCommand === 'get') {
    const flag = options.getString('name')
    if (flag) {
      const value = await Flags.getFeatureFlag(flag)
      return interaction.reply({
        content: `Flag \`${flag}\` is currently **${value ? 'ENABLED' : 'DISABLED'}**.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    const flags = await Flags.getFeatureFlags()
    const content = `Feature flags:\n${flags
      .map(
        ({ key, value }) => `- \`${key}\`: ${value ? 'ENABLED' : 'DISABLED'}`
      )
      .join('\n')}`

    return interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    })
  }

  if (subCommand === 'delete') {
    const flag = options.getString('name', true)
    await Flags.deleteFeatureFlag(flag)

    return interaction.reply({
      content: `Flag \`${flag}\` has been deleted.`,
      ephemeral: true,
    })
  }

  const flag = options.getString('name', true)
  const newValue = subCommand === 'enable'
  await Flags.setFeatureFlag(flag, newValue)

  return interaction.reply({
    content: `Flag \`${flag}\` has been set to **${newValue ? 'ENABLED' : 'DISABLED'}**.`,
    ephemeral: true,
  })
}
