import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { logger } from '../logger'

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
    option
      .setName('clan_bonds')
      .setDescription('Amount of clan bonds')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(500_000)
  )
  .addIntegerOption(option =>
    option
      .setName('raw_dust')
      .setDescription('Amount of dust')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('divine_essences')
      .setDescription('Amount of divine essences')
      .setRequired(true)
  )
  .setDescription('Estimate the amount of dust you have across resources')

export async function execute(interaction: ChatInputCommandInteraction) {
  const rareKeys = interaction.options.getInteger('rare_keys') ?? 0
  const epicKeys = interaction.options.getInteger('epic_keys') ?? 0
  const legKeys = interaction.options.getInteger('legendary_keys') ?? 0
  const clanBonds = interaction.options.getInteger('clan_bonds') ?? 0
  const rawDust = interaction.options.getInteger('raw_dust') ?? 0
  const divineEssences = interaction.options.getInteger('divine_essences') ?? 0

  logger.command(interaction)

  const legKeysViaBonds = Math.floor(clanBonds / 1500)
  const totalLegKeys = legKeys + legKeysViaBonds
  const divineEssencesViaLegKeys = Math.floor(totalLegKeys / 40) * 4
  const totalDivineEssences = divineEssences + divineEssencesViaLegKeys

  const viaRareKeys = rareKeys * 11
  const viaEpicKeys = epicKeys * 100
  const viaLegKeys = legKeys * 570
  const viaClanBonds = legKeysViaBonds * 570
  const viaDivineEssences =
    totalDivineEssences * 2880 + divineEssencesViaLegKeys * 4266

  const total =
    rawDust +
    viaRareKeys +
    viaEpicKeys +
    viaLegKeys +
    viaClanBonds +
    viaDivineEssences

  const formatter = new Intl.NumberFormat('en-US')
  const embed = new EmbedBuilder()
    .setTitle('Dust calculator')
    .setThumbnail('https://ehmb.netlify.app/eh_icon.png')
    .setTimestamp()
    .addFields(
      {
        name: 'Approximated total dust',
        value: formatter.format(total),
      },
      {
        name: 'Via rare keys',
        value: formatter.format(viaRareKeys),
        inline: true,
      },
      {
        name: 'Via epic keys',
        value: formatter.format(viaEpicKeys),
        inline: true,
      },
      {
        name: 'Via leg. keys',
        value: formatter.format(viaLegKeys),
        inline: true,
      },
      {
        name: 'Via clan bonds',
        value: formatter.format(viaClanBonds),
        inline: true,
      },
      {
        name: 'Via raw dust',
        value: formatter.format(rawDust),
        inline: true,
      },
      {
        name: 'Via divine essences',
        value: formatter.format(viaDivineEssences),
        inline: true,
      }
    )

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
}
