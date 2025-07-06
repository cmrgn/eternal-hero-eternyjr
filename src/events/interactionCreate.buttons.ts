import type { ButtonInteraction } from 'discord.js'

export async function handleButtons(interaction: ButtonInteraction) {
  const [action, threadId] = interaction.customId.split(':')
  const { channels, managers } = interaction.client
  const { Faq, Index } = managers

  if (action === 'retranslate') {
    const thread = await channels.fetch(threadId)
    if (!thread?.isThread()) return

    const resolvedThread = await Faq.resolveThread(thread)
    await interaction.update({
      content: 'Retranslation started…',
      components: [],
    })
    await Index.translateAndIndexThreadInAllLanguages(resolvedThread)
    await interaction.update({
      content: 'Retranslation and reindexing successful.',
      components: [],
    })
  }

  if (action === 'skip') {
    await interaction.update({
      content: 'Retranslation skipped.',
      components: [],
    })
  }
}
