import type { LanguageIdentifier } from 'cld3-asm'
import type { GiveawaysManager } from 'discord-giveaways'
import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'

import type { CrowdinManager } from '../managers/CrowdinManager'
import type { FAQManager } from '../managers/FAQManager'
import type { IndexManager } from '../managers/IndexManager'
import type { LeaderboardManager } from '../managers/LeaderboardManager'
import type { LocalizationManager } from '../managers/LocalizationManager'
import type { SearchManager } from '../managers/SearchManager'

type Command = {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
  execute: (
    interaction: CommandInteraction
  ) => Promise<InteractionResponse<unknown>>
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<PropertyKey, Command>

    crowdinManager: CrowdinManager
    faqManager: FAQManager
    giveawaysManager: GiveawaysManager
    indexManager: IndexManager
    leaderboardManager: LeaderboardManager
    localizationManager: LocalizationManager
    searchManager: SearchManager

    languageIdentifier: LanguageIdentifier
  }
}
