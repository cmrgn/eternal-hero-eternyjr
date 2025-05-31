# Database

The database, Postgres on Heroku (where the bot is hosted), is used for 2 purposes

- The `/giveaway` command uses the [discord-giveaways](https://github.com/Androz2091/discord-giveaways) package, which requires a database to work properly.
- The `/faqleaderboard` command stores the contribution data in the database (see [documentation](./FAQ_LEADERBOARD.md)).

We use the [essential-0 plan](https://devcenter.heroku.com/articles/heroku-postgres-plans), which is the cheapest and least permissive plan, but should be good enough for our needs.

## Table `giveaways` structure

The library relies on a single registry for all giveaways, regardless of the Discord server they belong to. So if the bot is used across multiple servers (or even locally), all giveaways end up in the same database table.

See migrations in the `migrations` folder, particularly the `1748697749855_init-schema` one that establishes the core schema.

## Inspecting the database

To inspect the content of the database, we use [pgweb](https://sosedoff.github.io/pgweb/) (installed via Homebrew on macOS). In the terminal, use the following command:

```sh
heroku config:get DATABASE_URL -a eternal-hero-bot | xargs pgweb --url
```

This will open a local server in the browser with a web-based interface to inspect the content of the database.
