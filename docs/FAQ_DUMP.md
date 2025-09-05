# FAQ Dump Script

The FAQ dump script generates a comprehensive archive of all FAQ entries from the Discord forum, creating individual Markdown files for each entry and packaging them into a zip file.

## Usage

### Basic Usage

```bash
NODE_ENV=production npm run faq-dump
```

This will generate a `faq-dump-YYYY-MM-DD.zip` file containing all FAQ entries as Markdown files (where the date is the current date).

> [!NOTE]  
> To target the real FAQ (and not the one from the test server), it is important to pass `NODE_ENV=production`. Note that this causes the FAQ dump logs to be aggregated in BetterStack.

### Advanced Usage

```bash
npm run faq-dump [output-path] [format] [include-front-matter]
```

**Parameters:**

- `output-path` (optional): Path for the output zip file (default: `faq-dump-YYYY-MM-DD.zip`)
- `format` (optional): Output format - `markdown` or `json` (default: `markdown`)
- `include-front-matter` (optional): Include YAML front matter in Markdown files - `true` or `false` (default: `true`)

**Examples:**

```bash
# Generate with custom filename
npm run faq-dump my-faq-archive.zip

# Generate JSON format instead of Markdown
npm run faq-dump faq-data-2024-01-15.zip json

# Generate without front matter
npm run faq-dump faq-clean.zip markdown false
```

## Output Structure

The generated zip file contains:

- **README.md**: Index file with table of contents and statistics
- **Individual FAQ files**: One file per FAQ entry (`.md` or `.json` format)
- **YAML Front Matter**: Thread ID, URL, tags, message count (if enabled)

### Markdown Format

Each Markdown file uses YAML front matter for metadata:

```md
---
title: "FAQ Entry Title"
thread_id: "1234567890123456789"
url: "https://discord.com/channels/..."
tags: ["tag1", "tag2"]
---

# FAQ Entry Title

Entry content here...
```
