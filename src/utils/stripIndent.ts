function minIndent(string: string) {
  const match = string.match(/^[ \t]*(?=\S)/gm)
  if (!match) return 0
  return match.reduce((r, a) => Math.min(r, a.length), Number.POSITIVE_INFINITY)
}

// Copied directly from the strip-indent package
export function stripIndent(string: string) {
  const indent = minIndent(string)
  if (indent === 0) return string
  const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm')
  return string.replace(regex, '')
}
