import 'dotenv/config'
import { createWriteStream, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import archiver from 'archiver'
import { Client, GatewayIntentBits } from 'discord.js'
import { DiscordManager } from '../managers/DiscordManager'
import { FAQManager, type ResolvedThread } from '../managers/FAQManager'
import { LogManager } from '../managers/LogManager'

type FAQDumpOptions = {
  outputPath?: string
  includeFrontMatter?: boolean
  format?: 'markdown' | 'json'
}

export function getDefaultFilename(): string {
  return `faq-dump-${new Date().toISOString().split('T')[0]}.zip`
}

export class FAQDumpGenerator {
  #client: Client
  #faqManager: FAQManager
  #logger: LogManager

  constructor() {
    this.#client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    })

    this.#logger = new LogManager('FAQDumpGenerator', 'info')
    this.#faqManager = new FAQManager(this.#client, 'info')
  }

  async initialize() {
    this.#logger.log('info', 'Initializing Discord client and FAQ manager')

    // Initialize Discord manager
    const discordManager = new DiscordManager()
    // @ts-expect-error - We only need Discord manager for this script
    this.#client.managers = { Discord: discordManager }

    // Login to Discord
    await this.#client.login(discordManager.token)

    // Wait for client to be ready
    await new Promise<void>(resolve => {
      this.#client.once('ready', () => {
        this.#logger.log('info', 'Discord client ready')
        resolve()
      })
    })

    // Cache FAQ threads
    await this.#faqManager.cacheThreads()
  }

  async generateDump(options: FAQDumpOptions = {}) {
    const {
      outputPath = getDefaultFilename(),
      includeFrontMatter = true,
      format = 'markdown',
    } = options

    this.#logger.log('info', 'Starting FAQ dump generation', { format, outputPath })

    try {
      // Get all resolved threads
      const threads = await this.#faqManager.getResolvedThreads()
      this.#logger.log('info', `Found ${threads.length} FAQ threads`)

      // Create temporary directory for files
      const tempDir = 'temp-faq-dump'
      mkdirSync(tempDir, { recursive: true })

      // Generate files for each thread
      const files: string[] = []
      for (const thread of threads) {
        const filename = this.#sanitizeFilename(thread.name)
        const filePath = join(tempDir, `${filename}.${format === 'markdown' ? 'md' : 'json'}`)

        if (format === 'markdown') {
          await this.#generateMarkdownFile(thread, filePath, includeFrontMatter)
        } else {
          await this.#generateJsonFile(thread, filePath)
        }

        files.push(filePath)
        this.#logger.log('info', `Generated file for thread: ${thread.name}`)
      }

      // Create index file
      const indexPath = join(tempDir, 'README.md')
      await this.#generateIndexFile(threads, indexPath)

      // Create zip archive
      await this.#createZipArchive(tempDir, outputPath, files)

      // Clean up temporary directory
      rmSync(tempDir, { force: true, recursive: true })

      this.#logger.log('info', `FAQ dump generated successfully: ${outputPath}`)
      return outputPath
    } catch (error) {
      this.#logger.log('error', 'Failed to generate FAQ dump', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  #sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid filename characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .toLowerCase()
      .substring(0, 100) // Limit length
  }

  async #generateMarkdownFile(
    thread: ResolvedThread,
    filePath: string,
    includeFrontMatter: boolean
  ) {
    const content = this.#formatThreadAsMarkdown(thread, includeFrontMatter)
    const writeStream = createWriteStream(filePath)
    writeStream.write(content)
    writeStream.end()

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
  }

  async #generateJsonFile(thread: ResolvedThread, filePath: string) {
    const data = {
      content: thread.content,
      id: thread.id,
      messages: thread.messages,
      name: thread.name,
      tags: thread.tags,
      url: thread.url,
    }

    const writeStream = createWriteStream(filePath)
    writeStream.write(JSON.stringify(data, null, 2))
    writeStream.end()

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
  }

  #formatThreadAsMarkdown(thread: ResolvedThread, includeFrontMatter: boolean): string {
    let content = ''

    if (includeFrontMatter) {
      // YAML front matter
      content += '---\n'
      content += `title: ${this.#escapeYamlString(thread.name)}\n`
      content += `thread_id: ${thread.id}\n`
      content += `url: ${thread.url}\n`
      if (thread.tags.length > 0) {
        content += `tags: [${thread.tags.map(tag => this.#escapeYamlString(tag)).join(', ')}]\n`
      }
      content += '---\n\n'
    }

    // Add title
    content += `# ${thread.name}\n\n`

    // Add content, preserving message structure for multi-message threads
    if (thread.messages.length > 1) {
      thread.messages.forEach(message => {
        content += this.#formatContentWithProperSpacing(message.content)
      })
    } else {
      content += this.#formatContentWithProperSpacing(thread.content)
    }

    return content
  }

  #escapeYamlString(str: string): string {
    // Escape YAML string if it contains special characters
    if (
      str.includes(':') ||
      str.includes('"') ||
      str.includes("'") ||
      str.includes('\n') ||
      str.includes('[') ||
      str.includes(']')
    ) {
      return `"${str.replace(/"/g, '\\"')}"`
    }
    return str
  }

  #formatContentWithProperSpacing(content: string): string {
    return `${content
      // Add empty line before headings
      .replace(/(\n|^)(#{1,6}\s)/g, '\n\n$2')
      // Collapse multiple empty lines
      .replace(/\n\n\n+/g, '\n\n')
      // Ensure content ends with proper spacing
      .trim()}\n\n`
  }

  async #generateIndexFile(threads: ResolvedThread[], indexPath: string) {
    let content = `# FAQ Dump Index\n\n`
    content += `Generated on: ${new Date().toISOString()}\n`
    content += `Total entries: ${threads.length}\n\n`

    // Collect all unique tags and organize threads by tag
    const tagMap = new Map<string, ResolvedThread[]>()
    const untaggedThreads: ResolvedThread[] = []

    threads.forEach(thread => {
      if (thread.tags.length === 0) {
        untaggedThreads.push(thread)
      } else {
        thread.tags.forEach(tag => {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, [])
          }
          const tagThreads = tagMap.get(tag)
          if (tagThreads) {
            tagThreads.push(thread)
          }
        })
      }
    })

    // Sort tags alphabetically
    const sortedTags = Array.from(tagMap.keys()).sort()

    // Generate sections for each tag
    sortedTags.forEach(tag => {
      const tagThreads = tagMap.get(tag)
      if (!tagThreads) return

      content += `## ${tag}\n\n`

      // Sort threads within each tag alphabetically
      const sortedTagThreads = [...tagThreads].sort((a, b) => a.name.localeCompare(b.name))

      sortedTagThreads.forEach(thread => {
        const filename = this.#sanitizeFilename(thread.name)
        content += `- [${thread.name}](./${filename}.md)\n`
      })
      content += '\n'
    })

    // Add untagged section if there are any
    if (untaggedThreads.length > 0) {
      content += `## Untagged\n\n`
      const sortedUntagged = [...untaggedThreads].sort((a, b) => a.name.localeCompare(b.name))
      sortedUntagged.forEach(thread => {
        const filename = this.#sanitizeFilename(thread.name)
        content += `- [${thread.name}](./${filename}.md)\n`
      })
      content += '\n'
    }

    content += `## Statistics\n\n`
    content += `- **Total threads:** ${threads.length}\n`
    content += `- **Total messages:** ${threads.reduce((sum, t) => sum + t.messages.length, 0)}\n`
    content += `- **Total characters:** ${threads.reduce((sum, t) => sum + t.content.length, 0)}\n`
    content += `- **Total words:** ${threads.reduce((sum, t) => sum + t.content.split(/\s+/).length, 0)}\n`

    // Tag statistics
    const tagCounts = new Map<string, number>()
    threads.forEach(thread => {
      thread.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      })
    })

    if (tagCounts.size > 0) {
      content += `\n### Tag Statistics\n\n`
      const sortedTagCounts = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])
      sortedTagCounts.forEach(([tag, count]) => {
        content += `- **${tag}:** ${count} entries\n`
      })
    }

    const writeStream = createWriteStream(indexPath)
    writeStream.write(content)
    writeStream.end()

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
  }

  async #createZipArchive(tempDir: string, outputPath: string, files: string[]) {
    return new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => {
        this.#logger.log('info', `Archive created: ${archive.pointer()} bytes`)
        resolve()
      })

      archive.on('error', (err: Error) => {
        this.#logger.log('error', 'Archive error', { error: err.message })
        reject(err)
      })

      archive.pipe(output)

      // Add all files to archive
      files.forEach(file => {
        archive.file(file, { name: file.replace(`${tempDir}/`, '') })
      })

      // Add README
      archive.file(join(tempDir, 'README.md'), { name: 'README.md' })

      archive.finalize()
    })
  }

  async destroy() {
    this.#logger.log('info', 'Destroying FAQ dump generator')
    await this.#client.destroy()
  }
}

// CLI execution
async function main() {
  const generator = new FAQDumpGenerator()

  try {
    await generator.initialize()

    const outputPath = process.argv[2] || 'faq-dump.zip'
    const format = (process.argv[3] as 'markdown' | 'json') || 'markdown'
    const includeFrontMatter = process.argv[4] !== 'false'

    console.log(`Generating FAQ dump to: ${outputPath}`)
    console.log(`Format: ${format}`)
    console.log(`Include front matter: ${includeFrontMatter}`)

    const result = await generator.generateDump({
      format,
      includeFrontMatter,
      outputPath,
    })

    console.log(`✅ FAQ dump generated successfully: ${result}`)
  } catch (error) {
    console.error(
      '❌ Failed to generate FAQ dump:',
      error instanceof Error ? error.message : String(error)
    )
    process.exit(1)
  } finally {
    await generator.destroy()
  }
}

// Run if this file is executed directly
if (process.argv[1]?.endsWith('faq-dump.ts')) {
  main()
}
