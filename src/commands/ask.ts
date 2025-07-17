import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { LANGUAGE_OBJECTS } from '../constants/i18n'
import { DiscordManager } from '../managers/DiscordManager'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('ask')
  .addStringOption(option =>
    option.setName('question').setDescription('Question to ask the FAQ').setRequired(true)
  )
  .addBooleanOption(option =>
    option.setName('raw').setDescription('Whether to skip rephrasing by ChatGPT')
  )
  /*
  .addBooleanOption(option =>
    option
      .setName('visible')
      .setDescription('Whether it should show for everyone')
  )
  */
  .setDescription('Ask the FAQ')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { options, client } = interaction
  const { Search, Localization, Prompt, CommandLogger } = client.managers

  CommandLogger.logCommand(interaction, 'Starting command execution')

  const query = options.getString('question', true)
  // @TODO: bring back the visibility option after the beta phase
  const visible = true // options.getBoolean('visible') ?? false
  const raw = options.getBoolean('raw') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral
  const embed = DiscordManager.createEmbed(false).setTitle(`Asked: “${query}”`)

  await interaction.deferReply({ flags })

  const guessedLanguage = await Localization.guessCrowdinLanguage(query)
  const languageObject = LANGUAGE_OBJECTS.find(({ crowdinCode }) => crowdinCode === guessedLanguage)

  if (!languageObject) {
    CommandLogger.logCommand(interaction, 'Aborting due to lack of guessed language')
    const errorMessage =
      'Unfortunately, the language could not be guessed from your query, or it is not currently supported.'
    return interaction.editReply({ embeds: [embed.setDescription(errorMessage)] })
  }

  const { crowdinCode, messages } = languageObject
  const { results } = await Search.search(query, 'VECTOR', crowdinCode, 1)
  const [result] = results

  if (!result) {
    CommandLogger.logCommand(interaction, 'Returning a lack of results', { crowdinCode })
    return interaction.editReply({ embeds: [embed.setDescription(messages.no_results)] })
  }

  const {
    entry_question: question,
    entry_answer: answer,
    entry_url: url,
    entry_indexed_at: indexedAt,
  } = result.fields

  embed.addFields(
    { inline: true, name: 'Source', value: url },
    { inline: true, name: 'Indexed on', value: DiscordManager.toTimestamp(indexedAt) }
  )

  if (raw) {
    CommandLogger.logCommand(interaction, 'Returning a raw answer', { crowdinCode })
    return interaction.editReply({ embeds: [embed.setDescription(answer)] })
  }

  CommandLogger.logCommand(interaction, 'Summarizing the answer', { crowdinCode, question })
  const localizedAnswer = await Prompt.summarize(query, { answer, languageObject, question })
  const message = await interaction.editReply({
    embeds: [embed.setDescription(localizedAnswer ?? answer)],
  })

  await Promise.all([message.react('👍'), message.react('👎')])
}
