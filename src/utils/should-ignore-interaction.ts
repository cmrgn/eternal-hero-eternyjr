import { IS_DEV, IS_PROD, TEST_SERVER_ID } from '../config'

export function shouldIgnoreInteraction(interaction: {
  guildId: string | null
}) {
  // Prevent the production bot from answering in the test server, and the test
  // bot from answering in any other server than the test one
  if (IS_PROD && interaction.guildId === TEST_SERVER_ID) return true
  if (IS_DEV && interaction.guildId !== TEST_SERVER_ID) return true
  return false
}
