import type { LanguageIdentifier } from 'cld3-asm'
import type { GiveawaysManager } from 'discord-giveaways'
import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'

import type { CrowdinManager } from '../managers/CrowdinManager'
import type { DiscordManager } from '../managers/DiscordManager'
import type { FAQManager } from '../managers/FAQManager'
import type { IndexManager } from '../managers/IndexManager'
import type { LeaderboardManager } from '../managers/LeaderboardManager'
import type { LocalizationManager } from '../managers/LocalizationManager'
import type { PromptManager } from '../managers/PromptManager'
import type { SearchManager } from '../managers/SearchManager'
import type { FlagsManager } from '../managers/FlagsManager'

type Command = {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
  execute: (
    interaction: CommandInteraction
  ) => Promise<InteractionResponse<unknown>>
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<PropertyKey, Command>
    managers: {
      Crowdin: CrowdinManager
      Discord: DiscordManager
      Faq: FAQManager
      Giveaways: GiveawaysManager
      Index: IndexManager
      Leaderboard: LeaderboardManager
      Localization: LocalizationManager
      Prompt: PromptManager
      Search: SearchManager
      Flags: FlagsManager
    }
  }
}
