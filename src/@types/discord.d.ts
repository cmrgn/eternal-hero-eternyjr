import type { LanguageIdentifier } from 'cld3-asm'
import type { GiveawaysManager } from 'discord-giveaways'
import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'
import type { FAQManager } from '../utils/FAQManager'
import type { LeaderboardManager } from '../utils/LeaderboardManager'
import type { SearchManager } from '../utils/SearchManager'
import type { LocalizationManager } from '../utils/LocalizationManager'

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
    leaderboardManager: LeaderboardManager
    searchManager: SearchManager
    localizationManager: LocalizationManager
    languageIdentifier: LanguageIdentifier
  }
}
