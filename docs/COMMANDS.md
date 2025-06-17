# Commands

This Discord bot is primarily intended to run on the [official Eternal Hero Discord server](https://discord.gg/MgbnmpWu). That being said, some of its commands — such as `/faq` — can be quite handy in other servers as well, like in clan-specific servers.

Each command has a scope, either `OFFICIAL` or `PUBLIC`. The “official” commands are only deployed to the official server and the test server. The “public” commands are deployed anywhere.

## Permissions

For the `/timeout` command to work properly on the official Discord server, the “Moderate members” permission is needed. For all other commands, no specific permission is needed so the bot can be invited with nothing but the `bot` scope.

## Initialization

If the bot is currently running on Heroku (as it should), adding it to a new server should automatically deploy the right commands to that Discord server. That’s because the bot reacts to the `GuildCreate` event, at which point it publishes all public commands to that server.

If needed, the `deploy-commands` and `delete-commands` scripts can be used to manually publish or unpublish the commands for a given server (whose ID is provided via the `GUILD_ID` environment variable).

## Configuration

Server administrators may want to restrict some commands to specific roles, or into specific channels. This can be done within the server settings.

1. Go into _Server settings_ > _Integrations_.
2. Find _Eterny Junior_ and click _Manage integration_.
3. For each command, one can decide whether it should be restricted to some roles or channels.
