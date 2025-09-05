import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js'
import pMap from 'p-map'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('faqping')
  .setDescription('Reopen all archived FAQ threads')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { client, guildId } = interaction
  const { Faq, Discord, CommandLogger } = client.managers

  CommandLogger.logCommand(interaction, 'Starting command execution')

  if (!guildId) {
    throw new Error('Could not retrieve guild ID from interaction.')
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const guild = await Discord.getGuild(client, guildId)
  const faqForum = await Faq.getFaqForum(guild)
  const archivedThreadsRes = await faqForum.threads.fetchArchived()
  const archivedThreads = Array.from(archivedThreadsRes.threads.values())

  if (archivedThreads.length === 0) {
    return interaction.editReply('No archived FAQ threads found — all threads already active.')
  }

  const results = await pMap(
    archivedThreads,
    async thread => {
      try {
        await thread.setArchived(false)
        return { success: true, thread }
      } catch (error) {
        CommandLogger.logCommand(interaction, 'Could not reopen thread', { error })
        return { error, success: false, thread }
      }
    },
    { concurrency: 20 }
  )

  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  await Faq.cacheThreads()

  const successWord = successful === 1 ? 'thread' : 'threads'
  const failureWord = failed === 1 ? 'thread' : 'threads'
  const successMessage = `Successfully reopened ${successful} archived FAQ ${successWord}`
  const failureMessage = `Failed to reopen ${failed} ${failureWord}.`

  return interaction.editReply({
    content: failed > 0 ? `${successMessage} ${failureMessage}` : successMessage,
  })
}
