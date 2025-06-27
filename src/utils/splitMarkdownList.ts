export function splitMarkdownList(message: string, maxLength = 2000): string[] {
  const lines = message.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    // Handle lines longer than maxLength by slicing them into pieces
    if (line.length > maxLength) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength))
      }
      continue
    }

    const candidate = current + (current ? '\n' : '') + line
    if (candidate.length > maxLength) {
      if (current) chunks.push(current)
      current = line
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}
