import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js'

import { logger } from '../utils/logger'
import { DiscordManager } from '../managers/DiscordManager'

export const scope = 'PUBLIC'

export const data = new SlashCommandBuilder()
  .setName('dust')
  .addIntegerOption(option =>
    option
      .setName('rare_keys')
      .setDescription('Amount of rare keys')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(25_000)
  )
  .addIntegerOption(option =>
    option
      .setName('epic_keys')
      .setDescription('Amount of epic keys')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(5_000)
  )
  .addIntegerOption(option =>
    option
      .setName('legendary_keys')
      .setDescription('Amount of legendary keys')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(1_000)
  )
  .addIntegerOption(option =>
    option.setName('raw_dust').setDescription('Amount of dust').setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('divine_essences').setDescription('Amount of divine essences').setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('clan_bonds')
      .setDescription('Amount of clan bonds')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(500_000)
  )
  .setDescription('Estimate the amount of dust you have across resources')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Starting command execution')

  const { options } = interaction

  const rareKeys = options.getInteger('rare_keys') ?? 0
  const epicKeys = options.getInteger('epic_keys') ?? 0
  const legKeys = options.getInteger('legendary_keys') ?? 0
  const rawDust = options.getInteger('raw_dust') ?? 0
  const essences = options.getInteger('divine_essences') ?? 0
  const clanBonds = options.getInteger('clan_bonds') ?? 0

  const legKeysViaBonds = Math.floor(clanBonds / 1500)
  const totalLegKeys = legKeys + legKeysViaBonds
  const essencesViaLegKeys = Math.floor(totalLegKeys / 40) * 4
  const totalEssences = essences + essencesViaLegKeys

  const viaRareKeys = rareKeys * 11
  const viaEpicKeys = epicKeys * 100
  const viaLegKeys = legKeys * 570
  const viaClanBonds = legKeysViaBonds * 570
  const viaEssences = totalEssences * 2880 + essencesViaLegKeys * 4266

  const total = rawDust + viaRareKeys + viaEpicKeys + viaLegKeys + viaClanBonds + viaEssences

  const { format } = new Intl.NumberFormat('en-US')
  const embed = DiscordManager.createEmbed()
    .setTitle('Dust calculator')
    .addFields(
      { name: 'Approximated total dust', value: format(total) },
      { name: 'Via rare keys', value: format(viaRareKeys), inline: true },
      { name: 'Via epic keys', value: format(viaEpicKeys), inline: true },
      { name: 'Via leg. keys', value: format(viaLegKeys), inline: true },
      { name: 'Via clan bonds', value: format(viaClanBonds), inline: true },
      { name: 'Via raw dust', value: format(rawDust), inline: true },
      { name: 'Via divine essences', value: format(viaEssences), inline: true }
    )

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
}
