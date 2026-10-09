import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { IS_STUDENT_APP } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import {
  formatBytes,
  pickDocuments,
  pickPhotos,
  takePhoto,
  type UploadFile,
} from '@/lib/storage'
import { uploadReportFile, type PendingFile } from '@/features/reports/api'
import { Button, FormError, Icon, Row, Sheet, T, space, useTheme } from '@/ui'

/**
 * "Attach" on a phone is three different sources — the camera, the photo
 * library and the files app. The Academy app offers all three behind one
 * button. The Student app goes straight to the files app: what a student sends
 * in is a document, and the owner asked for the one choice (Oct 2026). A photo
 * already on the phone can still be picked there.
 */
export function AttachButton({
  label,
  busy,
  disabled,
  onPick,
}: {
  label: string
  busy?: boolean
  disabled?: boolean
  onPick: (files: UploadFile[]) => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  async function from(source: () => Promise<UploadFile[]>) {
    setOpen(false)
    const files = await source()
    if (files.length > 0) onPick(files)
  }

  return (
    <>
      <Button
        small
        variant="outline"
        icon="paperclip"
        title={label}
        loading={busy}
        disabled={disabled}
        onPress={() =>
          IS_STUDENT_APP ? void from(pickDocuments) : setOpen(true)
        }
      />
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View>
          <Row
            first
            icon="camera"
            title={t('m.attach.camera')}
            onPress={() => void from(takePhoto)}
            chevron={false}
          />
          <Row
            icon="image"
            title={t('m.attach.photos')}
            onPress={() => void from(pickPhotos)}
            chevron={false}
          />
          <Row
            icon="file"
            title={t('m.attach.files')}
            onPress={() => void from(pickDocuments)}
            chevron={false}
          />
        </View>
      </Sheet>
    </>
  )
}

/** One attached file: its name, its size, and a way to take it off again. */
export function FileLine({
  name,
  size,
  onOpen,
  onRemove,
  busy,
}: {
  name: string
  size?: number | null
  onOpen?: () => void
  onRemove?: () => void
  busy?: boolean
}) {
  const { c } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 8,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
      }}
    >
      <Icon name="file-text" size={16} />
      <Pressable style={{ flex: 1 }} onPress={onOpen} disabled={!onOpen || busy}>
        <T v="small" numberOfLines={1} style={{ fontWeight: '500' }}>
          {name}
        </T>
        {size ? (
          <T v="tiny" muted>
            {formatBytes(size)}
          </T>
        ) : null}
      </Pressable>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} disabled={busy}>
          <Icon name="x" size={16} />
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Files for a report thread. Uploaded as they are picked, not on send: a 40 MB
 * portfolio uploaded inside the send handler would leave a button spinning, and
 * a failure would lose the comment typed above it (docs/report-checks.md).
 */
export function PendingFiles({
  academyId,
  files,
  onChange,
  disabled,
}: {
  academyId: string
  files: PendingFile[]
  onChange: (files: PendingFile[]) => void
  disabled?: boolean
}) {
  const { t } = useT()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(picked: UploadFile[]) {
    setUploading(true)
    setError(null)
    const next = [...files]
    try {
      for (const file of picked) {
        next.push(await uploadReportFile(academyId, file))
        onChange([...next])
      }
    } catch (e) {
      setError(errorMessage(e, t('upload.failed')))
    } finally {
      setUploading(false)
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      {files.map((f) => (
        <FileLine
          key={f.path}
          name={f.name}
          size={f.size}
          onRemove={() => onChange(files.filter((x) => x.path !== f.path))}
        />
      ))}
      <View style={{ flexDirection: 'row' }}>
        <AttachButton
          label={uploading ? t('report.file.uploading') : t('report.file.attach')}
          busy={uploading}
          disabled={disabled}
          onPick={(picked) => void add(picked)}
        />
      </View>
      <FormError error={error} />
    </View>
  )
}
