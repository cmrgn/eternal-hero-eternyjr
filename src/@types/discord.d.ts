import type { LanguageIdentifier } from 'cld3-asm'
import type { GiveawaysManager } from 'discord-giveaways'
import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'
import type { FAQManager } from '../managers/FAQManager'
import type { LeaderboardManager } from '../managers/LeaderboardManager'
import type { SearchManager } from '../managers/SearchManager'
import type { LocalizationManager } from '../managers/LocalizationManager'
import type { IndexationManager } from '../managers/IndexationManager'

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
    indexationManager: IndexationManager
    languageIdentifier: LanguageIdentifier
  }
}
