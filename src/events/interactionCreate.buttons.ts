import type { ButtonInteraction } from 'discord.js'

export async function handleButtons(interaction: ButtonInteraction) {
  const [action, id] = interaction.customId.split(':')
  const { channels, managers } = interaction.client
  const { Faq, Index, Flags } = managers

  if (action === 'confirm-retranslate') {
    const thread = await channels.fetch(id)
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

  if (action === 'skip-retranslate') {
    await interaction.update({
      content: 'Retranslation skipped.',
      components: [],
    })
  }

  if (action === 'confirm-delete') {
    await Flags.deleteFeatureFlag(id)
    await interaction.update({
      content: `Feature flag \`${id}\` deletion successful.`,
      components: [],
    })
  }

  if (action === 'cancel-delete') {
    await interaction.update({
      content: 'Flag deletion aborted.',
      components: [],
    })
  }
}
