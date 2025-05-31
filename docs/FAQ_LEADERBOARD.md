# FAQ Leaderboard

The `/faqleaderboard` command lists the top “FAQ ambassadors”, which are Discord members who share links to the FAQ, thus helping the community. The data is stored in the [database](./DATABASE.md).

## Scoring

There are two ways to have one’s contribution considered: with the `/faq` command, or with links in normal messages.

### Using the `/faq` command

When using the `/faq` command, only commands shared with the `visible: True` option yield a contribution. Private searches using the `/faq` are _not_ considered, as not to game the system.

### Linking to threads in messages

Including one or more FAQ links within a simple message yield a contribution. Note that:

- Links to the top level FAQ forum itself do not count, only links to threads do.
- The amount of links within a message does not impact the score, it’s always 1.
- If a message containing one or more FAQ links gets deleted, or edited to remove all links, the score gets reduced by 1 again as to not game the system.
- If a message gets edited to ultimately include one or more FAQ links, the score gets increased by 1.

## Technical consideration

In order to avoid constantly querying the FAQ forum from the Discord API, all threads are cached on the Discord client when it boots up. To make sure the cache stays up to date with the FAQ updates, `ThreadCreate`, `ThreadDelete` and `ThreadUpdate` (for renamings) events are subscribed to, and the cache gets renewed accordingly.
