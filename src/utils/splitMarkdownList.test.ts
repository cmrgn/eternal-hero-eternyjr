// src/utils/splitMarkdownList.test.ts
import { describe, it, expect } from 'vitest'
import { splitMarkdownList } from './splitMarkdownList'

describe('splitMarkdownList', () => {
  it('returns the entire message if under max length', () => {
    const message = 'Line 1\nLine 2\nLine 3'
    const result = splitMarkdownList(message, 100)
    expect(result).toEqual([message])
  })

  it('splits long message into chunks at line breaks', () => {
    const message = Array(100).fill('Line').join('\n') // creates a message with 100 lines
    const maxLength = 50
    const result = splitMarkdownList(message, maxLength)

    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(maxLength)
    }

    const recombined = result.join('\n')
    expect(recombined).toBe(message)
  })

  it('handles lines longer than maxLength', () => {
    const message = 'A'.repeat(3000) // single line longer than maxLength
    const result = splitMarkdownList(message, 1000)

    expect(result.length).toBe(3)
    expect(result.every(chunk => chunk.length <= 1000)).toBe(true)
  })

  it('handles empty string input', () => {
    const result = splitMarkdownList('')
    expect(result).toEqual([])
  })

  it('handles exact max length lines', () => {
    const line = 'A'.repeat(2000)
    const message = `${line}\n${line}`
    const result = splitMarkdownList(message, 2000)

    expect(result).toEqual([line, line])
  })
})
