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
      components: [],
      content: `Retranslation of thread \`${id}\` started…`,
    })
    await Index.translateAndIndexThreadInAllLanguages(resolvedThread)
    await interaction.update({
      components: [],
      content: `Retranslation and reindexing of thread \`${id}\` successful.`,
    })
  } else if (action === 'skip-retranslate') {
    await interaction.update({
      components: [],
      content: `Retranslation of thread \`${id}\` skipped.`,
    })
  }

  // Flag deletion
  if (action === 'confirm-delete') {
    await Flags.deleteFeatureFlag(id)
    await interaction.update({
      components: [],
      content: `Feature flag \`${id}\` deletion successful.`,
    })
  } else if (action === 'cancel-delete') {
    await interaction.update({
      components: [],
      content: 'Flag deletion aborted.',
    })
  }

  // Flag creation
  if (action === 'confirm-create') {
    const [flagName, newValue] = id.split(':')
    await Flags.setFeatureFlag(flagName, Boolean(newValue))
    await interaction.update({
      components: [],
      content: `Feature flag \`${flagName}\` creation successful.`,
    })
  } else if (action === 'cancel-create') {
    await interaction.update({
      components: [],
      content: 'Flag creation aborted.',
    })
  }
}
