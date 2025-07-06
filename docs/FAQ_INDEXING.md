# FAQ Indexing

## What is FAQ indexing?

FAQ indexing is the process of taking FAQ content from Discord threads (or their translations) and storing it as vector embeddings in Pinecone, a semantic search database. This allows the bot to answer natural language questions using the `/ask` command with accurate, meaning-based search.

## How indexing works

### Fetch FAQ Content

- If a thread ID is provided (`/index thread`), the bot fetches that specific thread.
- If indexing a whole language (`/index language`), it loads all threads from the FAQ manager.
- Uses `Faq.resolveThread()` to extract thread content.

### Handle translation

- If the target language is **English (`en`)**, no translation is needed.
- For other languages:
  - The bot checks Crowdin for existing translations.
  - If indexing a single thread, it translates that thread on the fly.
  - For full language indexing, it processes all threads concurrently (up to 20 at a time).

### Upload to Pinecone

- Converts each thread into a **vector embedding**, representing the semantic meaning.
- Uploads the embeddings to Pinecone under a namespace for the target language (e.g., `en`, `fr`).
- The process uses:
  - `Index.translateAndIndexThread()` — for non-English threads.
  - `Index.indexRecords()` — for English (no translation needed).

### Progress reporting

- The bot updates the Discord response with progress during indexing.
- Uses a rate limiter (`Bottleneck`) to prevent hitting Discord’s message edit rate limits.

## Error handling

- If translation, indexing, or uploading fails:
  - The bot sends an alert to Kitty’s server.
  - The alert includes the thread ID, language, and error details.

## Extras

- `/index stats` displays:
  - Entry, word, and character counts.
  - Estimated DeepL translation costs.
  - Current Pinecone storage usage.
- `/index deepl` updates the DeepL glossary with Crowdin translations to improve translation accuracy.

## Summary

- Indexing pushes FAQ content into Pinecone for semantic search.
- Enables the `/ask` command to perform natural language, AI-powered FAQ searches in multiple languages.
