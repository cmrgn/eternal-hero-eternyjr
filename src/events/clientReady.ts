import type { Client } from 'discord.js'

import { IS_DEV, TEST_SERVER_ID } from '../config'
import { deployCommands } from '../utils/commands'

export function onClientReady(client: Client<true>) {
  console.log(`Discord bot is ready! 🤖 Logged in as ${client.user.tag}`)

  // This makes it convenient to work on the bot locally, by automatically
  // redeploying the commands to the test server (given as an environment
  // variable) every time the server gets started (such as when saving a file
  // that gets bundled).
  if (IS_DEV && TEST_SERVER_ID) deployCommands(TEST_SERVER_ID)
}
