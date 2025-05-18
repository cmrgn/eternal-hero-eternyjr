import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'

type Command = {
  data: SlashCommandOptionsOnlyBuilder
  execute: (
    interaction: CommandInteraction
  ) => Promise<InteractionResponse<boolean>>
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<PropertyKey, Command>
  }
}
