import { Image, Linking, Pressable, View } from 'react-native'
import { parseBlocks, youtubeId } from '@/lib/blocks'
import { Icon, T, space, useTheme } from './index'

/**
 * Renders the block content assessments and assignments carry in their
 * `instructions` (text / image / youtube — `lib/blocks.ts`).
 *
 * A YouTube block is a thumbnail that opens the video in the YouTube app or
 * the browser, rather than an embedded player: an inline web view per video is
 * the heaviest thing a list of instructions could contain, and the phone
 * already has a better player for it.
 */
export function BlocksView({ body }: { body: unknown }) {
  const { c } = useTheme()
  const blocks = parseBlocks(body)
  if (blocks.length === 0) return null
  return (
    <View style={{ gap: space.md }}>
      {blocks.map((b) => {
        if (b.type === 'text') {
          return b.text.trim() ? <T key={b.id}>{b.text}</T> : null
        }
        if (b.type === 'image') {
          if (!b.url) return null
          return (
            <View key={b.id} style={{ gap: 4 }}>
              <Image
                source={{ uri: b.url }}
                resizeMode="contain"
                style={{
                  width: '100%',
                  aspectRatio: 16 / 10,
                  borderRadius: 8,
                  backgroundColor: c.muted,
                }}
              />
              {b.caption ? (
                <T v="small" muted>
                  {b.caption}
                </T>
              ) : null}
            </View>
          )
        }
        const id = youtubeId(b.url)
        if (!id) return null
        return (
          <Pressable
            key={b.id}
            onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${id}`)}
          >
            <Image
              source={{ uri: `https://img.youtube.com/vi/${id}/hqdefault.jpg` }}
              style={{
                width: '100%',
                aspectRatio: 16 / 9,
                borderRadius: 8,
                backgroundColor: c.muted,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="play" size={22} color="#ffffff" />
              </View>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
