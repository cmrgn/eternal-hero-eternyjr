import 'dotenv/config'

import { DiscordManager } from '../managers/DiscordManager'

const Discord = new DiscordManager()

const GUILD_ID = process.env.GUILD_ID
const COMMAND_NAME = process.env.COMMAND_NAME

if (!GUILD_ID) throw new Error('Missing ‘GUILD_ID’ environment variable.')

if (COMMAND_NAME) {
  Discord.deployCommand(GUILD_ID, COMMAND_NAME)
} else {
  Discord.deployCommands(GUILD_ID)
}
