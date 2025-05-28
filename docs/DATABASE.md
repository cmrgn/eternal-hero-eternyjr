# Database

The `/giveaway` command uses the [discord-giveaways](https://github.com/Androz2091/discord-giveaways) package, which requires a database to work properly. To that effect, we use Postgres on Heroku (where the bot is hosted).

We use the [essential-0 plan](https://devcenter.heroku.com/articles/heroku-postgres-plans), which is the cheapest and least permissive plan, but should be good enough for our needs.

## Database structure

The library relies on a single registry for all giveaways, regardless of the Discord server they belong to. So if the bot is used across multiple servers (or even locally), all giveaways end up in the same database table.

The table has only 2 columns: `id` which contains the Discord message ID of the giveaway embed, and `data` which contains a JSON blob with the giveaway configuration.

## Inspecting the database

To inspect the content of the database, we use [pgweb](https://sosedoff.github.io/pgweb/) (installed via Homebrew on macOS). In the terminal, use the following command:

```sh
heroku config:get DATABASE_URL -a eternal-hero-bot | xargs pgweb --url
```

This will open a local server in the browser with a web-based interface to inspect the content of the database.
