import type { AutocompleteInteraction } from 'discord.js'

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  const { client, commandName, options } = interaction
  const { Flags } = client.managers

  if (commandName === 'flag') {
    const focusedValue = options.getFocused()
    const flags = await Flags.autocomplete(focusedValue)
    await interaction.respond(flags)
  }
}
