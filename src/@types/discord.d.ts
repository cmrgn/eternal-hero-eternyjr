import type { GiveawaysManager } from 'discord-giveaways'
import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'

type Command = {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
  execute: (
    interaction: CommandInteraction
  ) => Promise<InteractionResponse<unknown>>
  autocomplete?: (
    interaction: AutocompleteInteraction
  ) => Promise<InteractionResponse<unknown>>
  onSubmit?: (
    interaction: AutocompleteInteraction
  ) => Promise<InteractionResponse<unknown>>
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<PropertyKey, Command>
    giveawaysManager: GiveawaysManager
  }
}
