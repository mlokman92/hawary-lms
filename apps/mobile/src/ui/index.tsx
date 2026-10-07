import { useState, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import DateTimePicker from '@react-native-community/datetimepicker'
import { errorMessage } from '@/lib/errors'
import { initialsOf } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'
import { radius, space, useTheme } from './theme'

export { radius, space, useTheme } from './theme'

export type IconName = ComponentProps<typeof Feather>['name']

/**
 * The page vocabulary for both apps — the phone counterpart of the web app's
 * `components/patterns`. Deliberately small: a screen, a card, a row, a button,
 * a field. A screen that needs something else should ask whether it needs it.
 */

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TextVariant = 'title' | 'heading' | 'body' | 'small' | 'tiny'

const TEXT: Record<TextVariant, TextStyle> = {
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  heading: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 15 },
}

export function T({
  v = 'body',
  muted,
  tone,
  bold,
  center,
  style,
  ...rest
}: ComponentProps<typeof Text> & {
  v?: TextVariant
  muted?: boolean
  tone?: Tone
  bold?: boolean
  center?: boolean
}) {
  const { c } = useTheme()
  return (
    <Text
      {...rest}
      style={[
        TEXT[v],
        { color: tone ? c.tone[tone] : muted ? c.mutedForeground : c.foreground },
        bold ? { fontWeight: '600' } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  )
}

export function Icon({
  name,
  size = 18,
  color,
  tone,
}: {
  name: IconName
  size?: number
  color?: string
  tone?: Tone
}) {
  const { c } = useTheme()
  return (
    <Feather
      name={name}
      size={size}
      color={color ?? (tone ? c.tone[tone] : c.mutedForeground)}
    />
  )
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  footer,
  padded = true,
}: {
  children: ReactNode
  scroll?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  /** Pinned under the content — the one obvious action of a form. */
  footer?: ReactNode
  padded?: boolean
}) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        padded ? styles.content : null,
        { paddingBottom: (padded ? space.lg : 0) + (footer ? 0 : insets.bottom) },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.mutedForeground}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded ? styles.content : null]}>{children}</View>
  )
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: c.card,
              borderTopColor: c.border,
              paddingBottom: Math.max(insets.bottom, space.md),
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

export function Card({
  children,
  style,
  flush,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** No inner padding — for a card that is a list of rows. */
  flush?: boolean
}) {
  const { c } = useTheme()
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.card, borderColor: c.border },
        flush ? { padding: 0 } : null,
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** A titled group. `action` is a text link on the right ("View all"). */
export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; onPress: () => void }
  children: ReactNode
}) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.sectionHead}>
        <T v="heading">{title}</T>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <T v="small" muted>
              {action.label}
            </T>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  )
}

export function Divider() {
  const { c } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
}

export function Stack({
  children,
  gap = space.md,
  row,
  style,
}: {
  children: ReactNode
  gap?: number
  row?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View
      style={[
        { gap },
        row ? { flexDirection: 'row', alignItems: 'center' } : null,
        style,
      ]}
    >
      {children}
    </View>
  )
}

/**
 * One line in a list card. Rows separate themselves, so a list is just rows
 * inside `<Card flush>`.
 */
export function Row({
  title,
  subtitle,
  icon,
  left,
  right,
  onPress,
  first,
  chevron,
}: {
  title: string
  subtitle?: string | null
  icon?: IconName
  left?: ReactNode
  right?: ReactNode
  onPress?: () => void
  /** The first row of a card draws no separator above itself. */
  first?: boolean
  chevron?: boolean
}) {
  const { c } = useTheme()
  const inner = (
    <View
      style={[
        styles.row,
        first
          ? null
          : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
      ]}
    >
      {left ?? (icon ? <Icon name={icon} /> : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T numberOfLines={2} bold={false} style={{ fontWeight: '500' }}>
          {title}
        </T>
        {subtitle ? (
          <T v="small" muted numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {(chevron ?? !!onPress) ? <Icon name="chevron-right" size={16} /> : null}
    </View>
  )
  if (!onPress) return inner
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? { backgroundColor: c.muted } : null)}
    >
      {inner}
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive'

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  small,
  style,
}: {
  title: string
  onPress?: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  icon?: IconName
  small?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { c } = useTheme()
  const off = disabled || loading
  const bg =
    variant === 'primary'
      ? c.primary
      : variant === 'destructive'
        ? c.destructive
        : 'transparent'
  const fg =
    variant === 'primary'
      ? c.primaryForeground
      : variant === 'destructive'
        ? '#ffffff'
        : c.foreground
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        styles.button,
        small ? styles.buttonSmall : null,
        {
          backgroundColor: bg,
          borderColor: variant === 'outline' ? c.border : 'transparent',
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Feather name={icon} size={small ? 14 : 16} color={fg} />
      ) : null}
      <Text
        style={{ color: fg, fontSize: small ? 13 : 15, fontWeight: '600' }}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  )
}

export function IconButton({
  name,
  onPress,
  label,
  badge,
}: {
  name: IconName
  onPress: () => void
  label: string
  badge?: number
}) {
  const { c } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ padding: 6 }}
    >
      <Feather name={name} size={21} color={c.foreground} />
      {badge && badge > 0 ? (
        <View style={[styles.dot, { backgroundColor: c.destructive }]}>
          <Text style={styles.dotText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | null
  children: ReactNode
}) {
  return (
    <View style={{ gap: 6 }}>
      <T v="small" style={{ fontWeight: '500' }}>
        {label}
      </T>
      {children}
      {hint ? (
        <T v="small" muted>
          {hint}
        </T>
      ) : null}
    </View>
  )
}

export function Input({ style, multiline, ...rest }: TextInputProps) {
  const { c } = useTheme()
  return (
    <TextInput
      placeholderTextColor={c.mutedForeground}
      multiline={multiline}
      {...rest}
      style={[
        styles.input,
        {
          borderColor: c.border,
          backgroundColor: c.card,
          color: c.foreground,
        },
        multiline ? { minHeight: 110, textAlignVertical: 'top', paddingTop: 10 } : null,
        style,
      ]}
    />
  )
}

export function SearchInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
}) {
  const { c } = useTheme()
  const { t } = useT()
  return (
    <View
      style={[
        styles.input,
        styles.search,
        { borderColor: c.border, backgroundColor: c.card },
      ]}
    >
      <Icon name="search" size={16} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('common.search')}
        placeholderTextColor={c.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, color: c.foreground, fontSize: 15, paddingVertical: 0 }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10}>
          <Icon name="x" size={16} />
        </Pressable>
      ) : null}
    </View>
  )
}

export function SwitchRow({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <View style={styles.switchRow}>
      <T style={{ flex: 1 }}>{label}</T>
      <RNSwitch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  )
}

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive'

export function Badge({
  label,
  variant = 'secondary',
  tone,
}: {
  label: string
  variant?: BadgeVariant
  tone?: Tone
}) {
  const { c } = useTheme()
  const color = tone
    ? c.tone[tone]
    : variant === 'default'
      ? c.primaryForeground
      : variant === 'destructive'
        ? c.destructive
        : c.foreground
  const bg = tone
    ? 'transparent'
    : variant === 'default'
      ? c.primary
      : variant === 'secondary'
        ? c.muted
        : 'transparent'
  const border = tone
    ? c.tone[tone]
    : variant === 'outline'
      ? c.border
      : variant === 'destructive'
        ? c.destructive
        : 'transparent'
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** A horizontal strip of mutually exclusive filters. */
export function Chips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string; count?: number }[]
  value: V
  onChange: (v: V) => void
}) {
  const { c } = useTheme()
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm }}
      style={{ flexGrow: 0 }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              {
                backgroundColor: on ? c.primary : c.card,
                borderColor: on ? c.primary : c.border,
              },
            ]}
          >
            <Text
              style={{
                color: on ? c.primaryForeground : c.foreground,
                fontSize: 13,
                fontWeight: '500',
              }}
            >
              {o.label}
              {o.count !== undefined ? ` · ${o.count}` : ''}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/** A number that is a sum over a set; pressing it shows the set. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  onPress,
}: {
  label: string
  value: string
  hint?: string | null
  tone?: Tone
  onPress?: () => void
}) {
  const { c } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.card,
        { flex: 1, minWidth: 0, backgroundColor: c.card, borderColor: c.border, gap: 2 },
      ]}
    >
      <T v="small" muted numberOfLines={1}>
        {label}
      </T>
      <T v="title" tone={tone} numberOfLines={1}>
        {value}
      </T>
      {hint ? (
        <T v="tiny" muted numberOfLines={2}>
          {hint}
        </T>
      ) : null}
    </Pressable>
  )
}

export function ProgressBar({ value }: { value: number }) {
  const { c } = useTheme()
  const pct = Math.max(0, Math.min(100, value))
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: c.muted, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 5, backgroundColor: c.primary }} />
    </View>
  )
}

export function Avatar({
  uri,
  name,
  email,
  size = 40,
}: {
  uri?: string | null
  name?: string | null
  email?: string | null
  size?: number
}) {
  const { c } = useTheme()
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.muted }}
      />
    )
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.foreground, fontSize: size * 0.36, fontWeight: '600' }}>
        {initialsOf(name, email)}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function Loading() {
  const { c } = useTheme()
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.mutedForeground} />
    </View>
  )
}

export function Empty({
  title,
  body,
  icon,
}: {
  title: string
  body?: string | null
  icon?: IconName
}) {
  return (
    <View style={[styles.center, { gap: 6 }]}>
      {icon ? <Icon name={icon} size={26} /> : null}
      <T center style={{ fontWeight: '500' }}>
        {title}
      </T>
      {body ? (
        <T v="small" muted center>
          {body}
        </T>
      ) : null}
    </View>
  )
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT()
  return (
    <View style={[styles.center, { gap: space.md }]}>
      <T center tone="danger">
        {errorMessage(error, t('common.error'))}
      </T>
      {onRetry ? (
        <Button title={t('common.retry')} variant="outline" small onPress={onRetry} />
      ) : null}
    </View>
  )
}

/** An inline error line under a form. Renders nothing without an error. */
export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null
  return (
    <T v="small" tone="danger">
      {error}
    </T>
  )
}

// ---------------------------------------------------------------------------
// Sheets, menus, pickers
// ---------------------------------------------------------------------------

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.card, paddingBottom: Math.max(insets.bottom, space.lg) },
          ]}
        >
          {title ? (
            <View style={styles.sheetHead}>
              <T v="heading" style={{ flex: 1 }}>
                {title}
              </T>
              <Pressable onPress={onClose} hitSlop={10}>
                <Icon name="x" size={20} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export type MenuItem = {
  label: string
  icon?: IconName
  onPress: () => void
  destructive?: boolean
}

/** The `⋯` button: everything occasional lives behind it. */
export function Menu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const { c } = useTheme()
  if (items.length === 0) return null
  return (
    <>
      <IconButton name="more-horizontal" label={label} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View>
          {items.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => {
                setOpen(false)
                item.onPress()
              }}
              style={[
                styles.menuItem,
                i === 0
                  ? null
                  : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
              ]}
            >
              {item.icon ? (
                <Icon
                  name={item.icon}
                  color={item.destructive ? c.destructive : c.foreground}
                />
              ) : null}
              <Text
                style={{
                  color: item.destructive ? c.destructive : c.foreground,
                  fontSize: 16,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  )
}

export function Select<V extends string>({
  value,
  options,
  onChange,
  placeholder,
  title,
}: {
  value: V | null
  options: { value: V; label: string; hint?: string }[]
  onChange: (v: V) => void
  placeholder?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const { c } = useTheme()
  const selected = options.find((o) => o.value === value)
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.input,
          styles.search,
          { borderColor: c.border, backgroundColor: c.card },
        ]}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            color: selected ? c.foreground : c.mutedForeground,
          }}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder ?? ''}
        </Text>
        <Icon name="chevron-down" size={16} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View>
          {options.map((o, i) => (
            <Pressable
              key={o.value}
              onPress={() => {
                setOpen(false)
                onChange(o.value)
              }}
              style={[
                styles.menuItem,
                i === 0
                  ? null
                  : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <T>{o.label}</T>
                {o.hint ? (
                  <T v="small" muted>
                    {o.hint}
                  </T>
                ) : null}
              </View>
              {o.value === value ? <Icon name="check" color={c.foreground} /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  )
}

/** A calendar day as `YYYY-MM-DD`, picked with the platform's own control. */
export function DateField({
  value,
  onChange,
  placeholder,
  minimumDate,
  maximumDate,
}: {
  value: string | null
  onChange: (ymd: string | null) => void
  placeholder?: string
  minimumDate?: Date
  maximumDate?: Date
}) {
  const [open, setOpen] = useState(false)
  const { c } = useTheme()
  const { t } = useT()
  const date = value ? new Date(`${value}T00:00:00`) : new Date()
  const toYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.input,
          styles.search,
          { borderColor: c.border, backgroundColor: c.card },
        ]}
      >
        <Text
          style={{ flex: 1, fontSize: 15, color: value ? c.foreground : c.mutedForeground }}
        >
          {value ?? placeholder ?? ''}
        </Text>
        {value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10}>
            <Icon name="x" size={16} />
          </Pressable>
        ) : (
          <Icon name="calendar" size={16} />
        )}
      </Pressable>
      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(event, picked) => {
            setOpen(false)
            if (event.type === 'set' && picked) onChange(toYmd(picked))
          }}
        />
      ) : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)}>
          <DateTimePicker
            value={date}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(_event, picked) => {
              if (picked) onChange(toYmd(picked))
            }}
          />
          <Button title={t('common.done')} onPress={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </>
  )
}

/** A yes/no question that changes something. Resolves true on confirm. */
export function confirm(opts: {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: opts.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: opts.confirmLabel,
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ])
  })
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 52,
  },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 34, paddingHorizontal: space.md },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    fontSize: 15,
  },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: '#ffffff', fontSize: 9, fontWeight: '700' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: space.lg,
    maxHeight: '88%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingVertical: space.sm,
  },
})
