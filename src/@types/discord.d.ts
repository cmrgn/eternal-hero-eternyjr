import type { Collection, SlashCommandOptionsOnlyBuilder } from 'discord.js'
import type { GiveawaysManager } from 'discord-giveaways'
import type { CrowdinManager } from '../managers/CrowdinManager'
import type { DatabaseManager } from '../managers/DatabaseManager'
import type { DeepLManager } from '../managers/DeepLManager'
import type { DiscordManager } from '../managers/DiscordManager'
import type { FAQManager } from '../managers/FAQManager'
import type { FlagsManager } from '../managers/FlagsManager'
import type { IndexManager } from '../managers/IndexManager'
import type { LeaderboardManager } from '../managers/LeaderboardManager'
import type { LocalizationManager } from '../managers/LocalizationManager'
import type { LogManager } from '../managers/LogManager'
import type { PromptManager } from '../managers/PromptManager'
import type { SearchManager } from '../managers/SearchManager'
import type { StoreManager } from '../managers/StoreManager'

type Command = {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
  execute: (interaction: CommandInteraction) => Promise<InteractionResponse<unknown>>
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<PropertyKey, Command>
    managers: {
      Crowdin: CrowdinManager
      Database: DatabaseManager
      DeepL: DeepLManager
      Discord: DiscordManager
      Faq: FAQManager
      Giveaways: GiveawaysManager
      Index: IndexManager
      Leaderboard: LeaderboardManager
      Localization: LocalizationManager
      Prompt: PromptManager
      Search: SearchManager
      Store: StoreManager
      Flags: FlagsManager
      CommandLogger: LogManager
    }
  }
}
