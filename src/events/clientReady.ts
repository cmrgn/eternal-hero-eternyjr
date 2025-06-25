import type { Client } from 'discord.js'

import { IS_DEV } from '../constants/config'
import { TEST_SERVER_ID } from '../constants/discord'
import { deployCommands } from '../utils/commands'

export function onClientReady(client: Client<true>) {
  console.log('[Discord]', 'Discord bot is ready and logged in', {
    tag: client.user.tag,
  })

  // This makes it convenient to work on the bot locally, by automatically
  // redeploying the commands to the test server (given as an environment
  // variable) every time the server gets started (such as when saving a file
  // that gets bundled).
  if (IS_DEV && TEST_SERVER_ID) deployCommands(TEST_SERVER_ID)
}
