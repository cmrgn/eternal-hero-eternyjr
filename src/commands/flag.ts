import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
          .setAutocomplete(true)
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
          .setAutocomplete(true)
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
          .setAutocomplete(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('get')
      .setDescription('Check 1 or all feature flags')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('The feature flag to check')
          .setAutocomplete(true)
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
        content:
          typeof value === 'undefined'
            ? `Flag \`${flag}\` does not exist.`
            : `Flag \`${flag}\` is currently **${value ? 'ENABLED' : 'DISABLED'}**.`,
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

    if (!(await Flags.hasFeatureFlag(flag))) {
      return interaction.reply({
        content: `Flag \`${flag}\` does not exist.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`confirm-delete:${flag}`)
      .setLabel('Yes, delete it')
      .setStyle(ButtonStyle.Danger)
    const cancelBtn = new ButtonBuilder()
      .setCustomId(`cancel-delete:${flag}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmBtn,
      cancelBtn
    )

    return interaction.reply({
      content: `Are you sure you want to delete the feature flag \`${flag}\`? Any reference to it in the code will resolve to \`false\`.`,
      components: [confirmRow],
      flags: MessageFlags.Ephemeral,
    })
  }

  const flag = options.getString('name', true)
  const newValue = subCommand === 'enable'

  if (!(await Flags.hasFeatureFlag(flag))) {
    const confirmBtn = new ButtonBuilder()
      .setCustomId(`confirm-create:${flag}:${newValue}`)
      .setLabel('Yes, create it')
      .setStyle(ButtonStyle.Primary)
    const cancelBtn = new ButtonBuilder()
      .setCustomId(`cancel-create:${flag}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmBtn,
      cancelBtn
    )

    return interaction.reply({
      content: `Flag \`${flag}\` does not exist. Do you want to create it?`,
      components: [confirmRow],
      flags: MessageFlags.Ephemeral,
    })
  }

  await Flags.setFeatureFlag(flag, newValue)

  return interaction.reply({
    content: `Flag \`${flag}\` has been set to **${newValue ? 'ENABLED' : 'DISABLED'}**.`,
    flags: MessageFlags.Ephemeral,
  })
}
