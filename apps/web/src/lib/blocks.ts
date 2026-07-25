export type TextBlock = { id: string; type: 'text'; text: string }
export type ImageBlock = {
  id: string
  type: 'image'
  url: string
  caption: string
}
export type YoutubeBlock = { id: string; type: 'youtube'; url: string }
export type Block = TextBlock | ImageBlock | YoutubeBlock
export type BlockType = Block['type']

export function newBlock(type: BlockType): Block {
  const id = crypto.randomUUID()
  if (type === 'text') return { id, type, text: '' }
  if (type === 'image') return { id, type, url: '', caption: '' }
  return { id, type: 'youtube', url: '' }
}

/** Extract a YouTube video id from common URL shapes; null if not recognised. */
export function youtubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /[?&]v=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

/** Coerce a jsonb body into a typed block array (ignores junk). */
export function parseBlocks(body: unknown): Block[] {
  if (!Array.isArray(body)) return []
  return body.filter(
    (b): b is Block =>
      !!b &&
      typeof b === 'object' &&
      'type' in b &&
      (b as Block).type != null &&
      ['text', 'image', 'youtube'].includes((b as Block).type),
  )
}
