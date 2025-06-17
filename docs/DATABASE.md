# Database

The database, Postgres on Heroku (where the bot is hosted), is used for a few things:

- The `/giveaway` command uses the [discord-giveaways](https://github.com/Androz2091/discord-giveaways) package, which requires a database to work properly.
- The `/faqleaderboard` command stores the contribution data in the database (see [documentation](./FAQ_LEADERBOARD.md)).
- The `/crowdin term` command stores a mapping of Crowdin translation keys to Crowdin string ID, since its API doesn’t allow for getting the ID for a specific term.

We use the [essential-0 plan](https://devcenter.heroku.com/articles/heroku-postgres-plans), which is the cheapest and least permissive plan, but should be good enough for our needs.

## Table `giveaways` structure

The library relies on a single registry for all giveaways, regardless of the Discord server they belong to. So if the bot is used across multiple servers (or even locally), all giveaways end up in the same database table.

See migrations in the `migrations` folder, particularly the `1748697749855_init-schema` one that establishes the core schema.

### [11/06/2025] Giveaway incident post-mortem

#### Explanation of what happened

The way the `discord-giveaways` package works is by creating a giveaway manager on the Discord client. When the bot starts, it fetches all the giveaways from the database, and gets ready to react to their events (end, pause, reroll, delete…).

When I’m working on the bot, I run a local version on my computer. That local bot connects to the same database, and therefore fetches the same giveaways.

When the giveaway ended, **both** the bot running on Heroku (hosting provider) and the local bot running on my computer reacted to the finish event, picked winners and sent a message in the channel where the giveaway was held.

The reason it didn’t happen for the previous giveaways we did is because I probably wasn’t running my local bot back then.

#### Solution

Initially, I thought I should filter the giveaways per Discord server ID when fetching them on start, but it cannot work like this. You could be running your bot on dozens of servers, so the bot itself (and thus the giveaway manager) is completely guild-agnostic. It cannot know in which server it runs.

What I’ve done instead is I added an “environment” property to each giveaway: either `DEV` or `PROD`. When the bot starts, it fetches only `PROD` giveaways when running on Heroku, and only `DEV` giveaways when running on my machines. That means it only listens to the events about giveaways that are relevant to where it runs.

This should make sure that giveaways happening on this server (or any other production server for that matter) are not considered by my local bot, and giveaways happening on my local server are not considered by the production bot.

## Inspecting the database

To inspect the content of the database, we use [pgweb](https://sosedoff.github.io/pgweb/) (installed via Homebrew on macOS). In the terminal, use the following command:

```sh
heroku config:get DATABASE_URL -a eternal-hero-bot | xargs pgweb --url
```

This will open a local server in the browser with a web-based interface to inspect the content of the database.
