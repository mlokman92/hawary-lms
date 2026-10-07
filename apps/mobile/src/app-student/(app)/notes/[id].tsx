import { Linking, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { WebView } from 'react-native-webview'
import { useT } from '@/lib/i18n'
import { useLearnNote } from '@/features/learn/api'
import { Empty, ErrorBlock, Loading, useTheme } from '@/ui'

/**
 * A note. Notes are rich text — the HTML the web editor (Tiptap) saves — so
 * they are shown in a web view, which is the one renderer that draws headings,
 * lists, tables, images and embedded video exactly as the author saw them.
 *
 * The page is given the app's own colours and type, and links are handed to the
 * phone's browser instead of navigating inside the note.
 */
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const { c } = useTheme()
  const { data: note, isLoading, error } = useLearnNote(id)

  const title = note?.title || t('common.untitled')

  if (isLoading) return <Loading />
  if (error || !note) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <ErrorBlock error={error ?? new Error(t('learn.note.not_available'))} />
      </>
    )
  }
  if (!note.content) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Empty icon="file-text" title={t('learn.note.empty')} />
      </>
    )
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5"/>
<style>
  html, body { margin: 0; padding: 0; background: ${c.background}; }
  body { padding: 16px 16px 48px; color: ${c.foreground};
    font: 16px/1.6 -apple-system, system-ui, Roboto, Helvetica, Arial, sans-serif;
    word-wrap: break-word; }
  h1 { font-size: 22px; line-height: 1.3; margin: 0 0 16px; }
  h2 { font-size: 19px; margin: 24px 0 8px; }
  h3 { font-size: 17px; margin: 20px 0 8px; }
  p { margin: 0 0 12px; }
  a { color: ${c.tone.info}; }
  img, video { max-width: 100%; height: auto; border-radius: 8px; }
  iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
  td, th { border: 1px solid ${c.border}; padding: 6px 8px; }
  blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid ${c.border}; color: ${c.mutedForeground}; }
  pre, code { background: ${c.muted}; border-radius: 6px; }
  pre { padding: 12px; overflow-x: auto; }
  ul, ol { padding-left: 22px; }
</style></head><body><h1>${title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</h1>${note.content}</body></html>`

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title }} />
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://app.hawary.my' }}
        style={{ flex: 1, backgroundColor: c.background }}
        allowsFullscreenVideo
        // A link in a note leaves the note: it opens in the browser, and the
        // note stays where the reader was.
        onShouldStartLoadWithRequest={(req) => {
          // An embedded video loading inside its frame is not a navigation.
          if (req.isTopFrame === false) return true
          const inline =
            req.url === 'about:blank' ||
            req.url.startsWith('https://app.hawary.my') ||
            req.url.startsWith('data:')
          if (inline) return true
          void Linking.openURL(req.url)
          return false
        }}
      />
    </View>
  )
}
