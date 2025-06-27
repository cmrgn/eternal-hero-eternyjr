import { describe, it, expect } from 'vitest'
import { cleanUpTranslation } from './cleanUpTranslation'

describe('cleanUpTranslation', () => {
  it('removes line breaks', () => {
    const input = 'Hello\nWorld\n!'
    const result = cleanUpTranslation(input)
    expect(result).toBe('HelloWorld!')
  })

  it('replaces pluralization tokens with singular form', () => {
    const input = 'You have {0:plural:item|items} in your bag'
    const result = cleanUpTranslation(input)
    expect(result).toBe('You have item in your bag')
  })

  it('removes opening and closing tags', () => {
    const input = 'This is <b>bold</b> and <i>italic</i>'
    const result = cleanUpTranslation(input)
    expect(result).toBe('This is bold and italic')
  })

  it('handles combined cases', () => {
    const input = '<b>Hello</b>\nYou have {0:plural:coin|coins}!\n'
    const result = cleanUpTranslation(input)
    expect(result).toBe('HelloYou have coin!')
  })

  it('trims leading and trailing spaces', () => {
    const input = '   <i>Test</i>   '
    const result = cleanUpTranslation(input)
    expect(result).toBe('Test')
  })

  it('handles strings with no special formatting', () => {
    const input = 'Just a normal string'
    const result = cleanUpTranslation(input)
    expect(result).toBe('Just a normal string')
  })
})
