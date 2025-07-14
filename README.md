# Eternal Hero bot

A Discord bot for the Eternal Hero community and its moderators. It handles giveaways, FAQ searching and summarizing, FAQ leaderboards, rules, timeouts, localization, and more.

## Environment variables

Create a `.env` file with the following environment variables:

```sh
NODE_ENV=development

# See: https://discordjs.guide/creating-your-bot/#using-config-json
DISCORD_CLIENT_ID=
DISCORD_TOKEN=

# This is test Discord server, that can be used to try things out locally
TEST_SERVER_ID=

# See: ./docs/DATABASE.md
DATABASE_URL=

# API keys for various integrations
CROWDIN_TOKEN=
PINECONE_API_KEY=
OPENAI_API_KEY=
DEEPL_API_KEY=

# Apple Store authentication
APPLE_STORE_ISSUER_ID=
APPLE_STORE_KEY_ID=
APPLE_STORE_PRIVATE_KEY=

# Google Play authentication
GOOGLE_PLAY_CLIENT_EMAIL=
GOOGLE_PLAY_PRIVATE_KEY=
GOOGLE_PLAY_PRIVATE_KEY_ID=
```
