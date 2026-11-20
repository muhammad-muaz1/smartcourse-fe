import { describe, expect, it } from 'vitest'
import { ATTACHMENT_EXTENSIONS, attachmentGroup, fileExtension, formatBytes, previewOf } from './files'

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

describe('attachment allow-list', () => {
  it('accepts every common document and image type', () => {
    for (const ext of ['.pdf', '.docx', '.odt', '.rtf', '.xlsx', '.pptx', '.jpg', '.jpeg', '.png', '.heic', '.svg', '.zip']) {
      expect(ATTACHMENT_EXTENSIONS).toContain(ext)
    }
  })
  it('has no duplicates and never allows HTML or executables', () => {
    expect(new Set(ATTACHMENT_EXTENSIONS).size).toBe(ATTACHMENT_EXTENSIONS.length)
    for (const ext of ['.html', '.htm', '.js', '.exe', '.sh']) expect(ATTACHMENT_EXTENSIONS).not.toContain(ext)
  })
  it('groups files by extension', () => {
    expect(attachmentGroup('photo.JPEG')).toBe('image')
    expect(attachmentGroup('budget.ods')).toBe('spreadsheet')
    expect(attachmentGroup('deck.key')).toBe('presentation')
    expect(attachmentGroup('page.html')).toBeNull()
  })
  it('previews browser-renderable images only', () => {
    expect(previewOf({ filename: 'a.jpeg', size_bytes: 1 })?.kind).toBe('image')
    expect(previewOf({ filename: 'a.bmp', size_bytes: 1 })?.kind).toBe('image')
    expect(previewOf({ filename: 'a.heic', size_bytes: 1 })).toBeNull()
  })
})
