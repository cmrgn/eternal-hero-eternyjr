import type { AutocompleteInteraction } from 'discord.js'

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  const { Flags } = interaction.client.managers

  if (interaction.commandName === 'flag') {
    const focusedValue = interaction.options.getFocused()
    const flags = await Flags.getFeatureFlags()
    await interaction.respond(
      flags
        .filter(({ key }) => key.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 25)
        .map(({ key }) => ({ name: key, value: key }))
    )
  }
}
