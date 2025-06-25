import ms, { type StringValue } from 'ms'
import {
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  InteractionContextType,
  type InteractionReplyOptions,
  MessageFlags,
  SlashCommandBuilder,
  type SlashCommandStringOption,
} from 'discord.js'

import { logger } from '../utils/logger'

export const scope = 'PUBLIC'

const messageIdOption = (option: SlashCommandStringOption) => {
  return option
    .setName('message_id')
    .setDescription('Message ID of the giveaway')
    .setRequired(true)
}

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a new giveaway')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Duration (e.g. 6h, 2d, 1w)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('prize').setDescription('Prize').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('winner_count').setDescription('Amount of winners')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('reroll')
      .setDescription('Reroll the winner of an ended giveaway')
      .addStringOption(messageIdOption)
      .addIntegerOption(option =>
        option
          .setName('new_winner_count')
          .setDescription('New amount of winners')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('Edit an active giveaway')
      .addStringOption(messageIdOption)
      .addStringOption(option =>
        option
          .setName('extra_duration')
          .setDescription('Additional duration (e.g. 6h, 2d, 1w)')
      )
      .addStringOption(option =>
        option.setName('new_prize').setDescription('New prize')
      )
      .addIntegerOption(option =>
        option
          .setName('new_winner_count')
          .setDescription('New amount of winners')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete an existing giveaway')
      .addStringOption(messageIdOption)
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('end')
      .setDescription('End an active giveaway')
      .addStringOption(messageIdOption)
  )
  .setDescription('Top-level command to manage giveaways')
  .setContexts(InteractionContextType.Guild)

const MESSAGES = {
  giveaway: undefined,
  giveawayEnded: undefined,
  title: ':sparkles: :tada: Eternal Giveaway: {this.prize} :tada: :sparkles:',
  drawing: 'Ends {timestamp}',
}

function initiatorAnswer(
  messageId: string,
  action: string
): InteractionReplyOptions {
  return {
    content: `:white_check_mark: Giveaway ${messageId} was successfully ${action}.`,
    flags: MessageFlags.Ephemeral,
  }
}

function initiatorError(message?: string): InteractionReplyOptions {
  return {
    content: `:x: ${message ?? 'An error occurred, please check the logs and try again.'}`,
    flags: MessageFlags.Ephemeral,
  }
}

function getGiveaway(
  interaction: ChatInputCommandInteraction,
  messageId: string
) {
  return interaction.client.giveawaysManager.giveaways.find(
    giveaway =>
      giveaway.guildId === interaction.guildId &&
      giveaway.messageId === messageId
  )
}

function ensureLegitimacy(interaction: ChatInputCommandInteraction) {
  const messageId = interaction.options.getString('message_id', true)
  const giveaway = getGiveaway(interaction, messageId)

  if (messageId && !giveaway) {
    throw new Error(`Unable to find a giveaway for \`${messageId}\`.`)
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    logger.command(interaction, 'Starting command execution')

    const { client, options, channel } = interaction
    const subcommand = options.getSubcommand()
    const isStart = subcommand === 'start'
    const messageId = options.getString('message_id', !isStart) ?? ''

    if (!isStart) ensureLegitimacy(interaction)

    switch (subcommand) {
      case 'start': {
        logger.command(interaction, 'Starting giveaway')

        const data = await client.giveawaysManager.start(
          channel as GuildTextBasedChannel,
          {
            duration: ms(options.getString('duration', true) as StringValue),
            winnerCount: options.getInteger('winner_count') ?? 1,
            prize: options.getString('prize', true),
            messages: MESSAGES,
          }
        )
        await interaction.reply(initiatorAnswer(data.messageId, 'started'))

        break
      }
      case 'reroll': {
        logger.command(interaction, 'Rerolling giveaway')

        await client.giveawaysManager.reroll(messageId, {
          winnerCount: options.getInteger('new_winner_count') ?? undefined,
        })
        await interaction.reply(initiatorAnswer(messageId, 'rerolled'))

        break
      }
      case 'edit': {
        const extraDuration = options.getString('extra_duration')
        logger.command(interaction, 'Editing giveaway')

        await client.giveawaysManager.edit(messageId, {
          addTime: extraDuration ? ms(extraDuration as StringValue) : undefined,
          newWinnerCount: options.getInteger('new_winner_count') ?? undefined,
          newPrize: options.getString('new_prize') ?? undefined,
        })
        await interaction.reply(initiatorAnswer(messageId, 'edited'))

        break
      }
      case 'delete': {
        logger.command(interaction, 'Deleting giveaway')

        await client.giveawaysManager.delete(messageId)
        await interaction.reply(initiatorAnswer(messageId, 'deleted'))

        break
      }
      case 'end': {
        logger.command(interaction, 'Ending giveaway')

        await client.giveawaysManager.end(messageId)
        await interaction.reply(initiatorAnswer(messageId, 'ended'))

        break
      }
    }
  } catch (error) {
    console.error(error)
    await interaction.reply(initiatorError())
  }
}
