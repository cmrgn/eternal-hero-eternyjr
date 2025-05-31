import type { GiveawaysManager } from 'discord-giveaways'
import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'
import type { FAQManager } from '../utils/faq-manager'

type Command = {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
  execute: (
    interaction: CommandInteraction
  ) => Promise<InteractionResponse<unknown>>
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<PropertyKey, Command>
    giveawaysManager: GiveawaysManager
    faqManager: FAQManager
  }
}
