import 'dotenv/config'
import { FAQDumpGenerator, getDefaultFilename } from '../utils/FAQDumpGenerator'

;(async function main() {
  const generator = new FAQDumpGenerator()

  try {
    await generator.initialize()

    const options = {
      format: (process.argv[3] as 'markdown' | 'json') || 'markdown',
      includeFrontMatter: process.argv[4] !== 'false',
      outputPath: process.argv[2],
    }

    // Get the actual output path that will be used (including default)
    const finalOutputPath = options.outputPath || getDefaultFilename()

    console.log(`Generating FAQ dump to: ${finalOutputPath}`)
    console.log(`Format: ${options.format}`)
    console.log(`Include front matter: ${options.includeFrontMatter}`)

    const result = await generator.generateDump(options)

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
})()
