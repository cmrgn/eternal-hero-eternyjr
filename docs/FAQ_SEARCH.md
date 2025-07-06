# FAQ Search

A big part of this Discord bot is its ability to search the Eternal Hero FAQ. It provides two different interfaces for this: the `/faq` command and the `/ask` command.

## The `/faq` command

### What it does

- Allows users to search the FAQ with a simple command.
- The user provides a keyword to search for, with optional settings:
  - `visible` — whether the result should be visible to everyone or only to the user.
  - `user` — mention another user in the response.
  - `method` — choose between fuzzy search (default) or vector search (see section on fuzzy- vs. vector-search).

### How it works

- The bot queries the FAQ database using the provided keyword.
- If results are found:
  - Builds an embed with the list of matched FAQ entries.
  - Optionally updates the leaderboard for contributions if the result is public (see [documentation](./FAQ_LEADERBOARD.md)).
- If no results are found:
  - Attempts to map the query to an alternative keyword which is known to yield results.
  - Otherwise replies with an error message.
  - Sends an alert to Kitty’s server.

### Technical implementation

The fuzzy search uses [Fuse.js](https://www.fusejs.io/), and only performs the search on the title of the FAQ entries — content is completely ignored.

If it doesn’t find any result, it looks through an alternative keywords table, and if it found an alternative keyword, it reruns the FAQ search with that keyword.

For instance, searching for “augmentation” yields no result because the entry about augmentation is called “How to reroll Rank Power?” The alternative keywords table maps “augmentation” to “reroll rank power”, which yields a result.

## The `/ask` command

### What it does

- Allows users to search the FAQ with a simple command.
- The user provides a keyword to search for, with optional settings:
  - `visible` — whether the result should be visible to everyone or only to the user.
  - `user` — mention another user in the response.

### How it works

- The bot automatically detects the language of the question.
- It searches the correct localized FAQ database using a vector search for the most relevant result.
- If a result is found:
  - Returns the answer, along with the source URL and the date it was indexed.
  - Optionally returns the raw FAQ answer if the `raw` option is set (bypasses ChatGPT rephrasing).
- If no result is found:
  - Returns a localized message indicating no results.

### Key features

- Language detection via localization manager.
- Uses AI summarization to improve the response unless raw is selected.
- Handles error cases gracefully if the language can’t be detected or no FAQ entries match.

## Vector Search vs. Fuzzy Search (or Text Matching)

- `/faq` or `/faq method: FUZZY` → fuzzy search
- `/ask` or `/faq method: VECTOR` → vector search

### Fuzzy Search / Text Matching

- This searches for literal text matches or similar words.
- It works by comparing the input keyword to the FAQ entries using things like:
  - Exact matches
  - Partial matches
  - Typo-tolerant matches (e.g. “herp” matches “hero”)
- It’s fast and simple but relies on the user choosing the right words.

### Vector Search

- Vector search uses semantic meaning, not just words.
- The bot converts both the user’s question and the FAQ entries into mathematical vectors — representations of their meaning.
- Instead of matching words, it matches concepts.
- Example: If you ask, _“How do I improve my strength?”_, vector search might find an FAQ about _“hero leveling”_ or _“training boosts”_ even if those words aren’t an exact match.
