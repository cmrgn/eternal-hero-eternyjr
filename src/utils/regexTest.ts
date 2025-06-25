export function regexTest(haystack: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex specials
  const regex = new RegExp(`\\b${escaped}\\b`, 'i')
  return regex.test(haystack)
}
