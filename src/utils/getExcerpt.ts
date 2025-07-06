export function getExcerpt(input: string) {
  const [firstLine] = input.trim().split('\n')
  const maxLength = 100
  if (firstLine.length < maxLength) return firstLine
  return `${firstLine.slice(0, maxLength)}…`
}
