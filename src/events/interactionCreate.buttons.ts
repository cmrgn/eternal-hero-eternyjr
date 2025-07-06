import type { ButtonInteraction } from 'discord.js'

export async function handleButtons(interaction: ButtonInteraction) {
  const [action, id] = interaction.customId.split(':')
  const { channels, managers } = interaction.client
  const { Faq, Index, Flags } = managers

  // Translation
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
  } else if (action === 'skip-retranslate') {
    await interaction.update({
      content: 'Retranslation skipped.',
      components: [],
    })
  }

  // Flag deletion
  if (action === 'confirm-delete') {
    await Flags.deleteFeatureFlag(id)
    await interaction.update({
      content: `Feature flag \`${id}\` deletion successful.`,
      components: [],
    })
  } else if (action === 'cancel-delete') {
    await interaction.update({
      content: 'Flag deletion aborted.',
      components: [],
    })
  }

  // Flag creation
  if (action === 'confirm-create') {
    const [flagName, newValue] = id.split(':')
    await Flags.setFeatureFlag(flagName, Boolean(newValue))
    await interaction.update({
      content: `Feature flag \`${flagName}\` creation successful.`,
      components: [],
    })
  } else if (action === 'cancel-create') {
    await interaction.update({
      content: 'Flag creation aborted.',
      components: [],
    })
  }
}
