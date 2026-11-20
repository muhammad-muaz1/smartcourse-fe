import { describe, expect, it } from 'vitest'
import { fileExtension, formatBytes, previewOf } from './files'

describe('fileExtension', () => {
  it('lower-cases the last extension', () => expect(fileExtension('Report.Final.PDF')).toBe('pdf'))
  it('returns empty for dotfiles and bare names', () => {
    expect(fileExtension('.env')).toBe('')
    expect(fileExtension('README')).toBe('')
  })
})

describe('previewOf', () => {
  const f = (filename: string, size_bytes = 1000) => ({ filename, size_bytes })
  it('classifies browser-viewable formats', () => {
    expect(previewOf(f('a.pdf'))?.kind).toBe('pdf')
    expect(previewOf(f('a.PNG'))?.kind).toBe('image')
    expect(previewOf(f('a.mp4'))?.kind).toBe('video')
    expect(previewOf(f('a.mp3'))?.kind).toBe('audio')
    expect(previewOf(f('a.csv'))).toEqual({ kind: 'text', mime: 'text/plain' })
  })
  it('never previews HTML or office formats', () => {
    for (const name of ['a.html', 'a.htm', 'a.docx', 'a.xlsx', 'a.pptx', 'a.zip']) expect(previewOf(f(name))).toBeNull()
  })
  it('falls back to download-only past the size cap', () => {
    expect(previewOf(f('a.txt', 3 * 1024 ** 2))).toBeNull()
  })
})

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB')
  })
})
