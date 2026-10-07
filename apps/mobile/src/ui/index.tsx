import { createElement, useState, type ComponentProps, type ReactNode } from 'react'
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
import {
  elevation,
  font,
  radius,
  soft,
  space,
  toWeight,
  useTheme,
  type Weight,
} from './theme'

export { elevation, font, radius, soft, space, useTheme } from './theme'

export type IconName = ComponentProps<typeof Feather>['name']

/**
 * The page vocabulary for both apps — the phone counterpart of the web app's
 * `components/patterns`. Deliberately small: a screen, a card, a row, a button,
 * a field. A screen that needs something else should ask whether it needs it.
 *
 * The look is defined here and in `theme.tsx` and nowhere else. A screen says
 * WHAT it shows (`<Row icon=… title=… />`); how that looks — the tinted icon
 * tile, the radius, the weight of the type — is this file's business, which is
 * what lets the whole of both apps be restyled from one place.
 */

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'small' | 'tiny'

const TEXT: Record<
  TextVariant,
  { size: number; line: number; weight: Weight; tracking?: number }
> = {
  display: { size: 30, line: 36, weight: 800, tracking: -0.7 },
  title: { size: 24, line: 30, weight: 700, tracking: -0.4 },
  heading: { size: 17, line: 23, weight: 700, tracking: -0.1 },
  body: { size: 15, line: 22, weight: 400 },
  small: { size: 13, line: 18, weight: 400 },
  tiny: { size: 11.5, line: 15, weight: 500 },
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
  const spec = TEXT[v]
  // A weight is a font FILE here, not a number the platform interprets (see
  // `font()`), so a `fontWeight` passed in a style is translated and dropped.
  const { fontWeight, ...flat } = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const weight =
    fontWeight !== undefined ? toWeight(fontWeight) : bold ? 600 : spec.weight
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: font(weight),
          fontSize: spec.size,
          lineHeight: spec.line,
          letterSpacing: spec.tracking,
          color: tone ? c.tone[tone] : muted ? c.mutedForeground : c.foreground,
        },
        center ? { textAlign: 'center' } : null,
        flat,
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

/** An icon on a tinted, rounded tile — how a row or an empty state leads. */
export function IconTile({
  name,
  size = 38,
  tone,
}: {
  name: IconName
  size?: number
  tone?: Tone
}) {
  const { c, dark } = useTheme()
  const ink = tone ? c.tone[tone] : c.brand
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: tone ? soft(ink, dark) : c.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name={name} size={Math.round(size * 0.47)} color={ink} />
    </View>
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
  const { c, dark } = useTheme()
  const insets = useSafeAreaInsets()
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        padded ? styles.content : null,
        { paddingBottom: (padded ? space.xl : 0) + (footer ? 0 : insets.bottom) },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.brand}
            colors={[c.brand]}
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
              paddingBottom: Math.max(insets.bottom, space.lg),
            },
            dark
              ? { borderTopWidth: 1, borderTopColor: c.border }
              : { boxShadow: '0 -6px 20px rgba(24,24,27,0.06)' },
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
  const { c, dark } = useTheme()
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.card },
        elevation(c, dark),
        flush ? { padding: 0, overflow: 'hidden' } : null,
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
  const { c } = useTheme()
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.sectionHead}>
        <T v="heading" style={{ fontSize: 18 }}>
          {title}
        </T>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10}>
            <T v="small" style={{ color: c.brand, fontWeight: '600' }}>
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
 * inside `<Card flush>`. An `icon` is drawn on a tinted tile; the separator
 * starts after it, so the eye runs down the titles.
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
  const lead = left ?? (icon ? <IconTile name={icon} /> : null)
  const inner = (
    <View>
      {first ? null : (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: c.border,
            marginLeft: lead ? space.lg + 38 + space.md : space.lg,
          }}
        />
      )}
      <View style={styles.row}>
        {lead}
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <T numberOfLines={2} style={{ fontWeight: '600' }}>
            {title}
          </T>
          {subtitle ? (
            <T v="small" muted numberOfLines={2}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {right}
        {(chevron ?? !!onPress) ? (
          <Feather name="chevron-right" size={18} color={c.mutedForeground} />
        ) : null}
      </View>
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

/**
 * `primary` is the brand, filled — one per screen, the obvious action.
 * `outline` is the same colour as a tint: a real button, but not the answer.
 * `ghost` is text. `destructive` is for the thing that cannot be undone.
 */
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
        : variant === 'outline'
          ? c.brandSoft
          : 'transparent'
  const fg =
    variant === 'primary' || variant === 'destructive'
      ? c.primaryForeground
      : c.brand
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
          opacity: off ? 0.45 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !off ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Feather name={icon} size={small ? 15 : 18} color={fg} />
      ) : null}
      <Text
        style={{
          color: fg,
          fontFamily: font(700),
          fontSize: small ? 13.5 : 16,
          letterSpacing: -0.1,
          flexShrink: 1,
        }}
        numberOfLines={1}
        // A label that is a few points too wide for its button shrinks a
        // little before it is ever cut short.
        adjustsFontSizeToFit
        minimumFontScale={0.85}
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
  surface,
}: {
  name: IconName
  onPress: () => void
  label: string
  badge?: number
  /** Draw it as a raised round button — for a control that sits on the canvas. */
  surface?: boolean
}) {
  const { c, dark } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        surface ? [{ backgroundColor: c.card }, elevation(c, dark)] : null,
        pressed ? { backgroundColor: c.muted } : null,
      ]}
    >
      <Feather name={name} size={20} color={c.foreground} />
      {badge && badge > 0 ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: c.destructive, borderColor: surface ? c.card : c.background },
          ]}
        >
          <Text style={[styles.dotText, { fontFamily: font(700) }]}>
            {badge > 99 ? '99+' : badge}
          </Text>
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
    <View style={{ gap: 7 }}>
      <T v="small" style={{ fontWeight: '600' }}>
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

export function Input({ style, multiline, onFocus, onBlur, ...rest }: TextInputProps) {
  const { c } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      placeholderTextColor={c.mutedForeground}
      multiline={multiline}
      {...rest}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        onBlur?.(e)
      }}
      style={[
        styles.input,
        {
          borderColor: focused ? c.brand : c.border,
          backgroundColor: c.card,
          color: c.foreground,
          fontFamily: font(400),
        },
        multiline ? { minHeight: 120, textAlignVertical: 'top', paddingTop: 14 } : null,
        // The browser draws its own focus ring; the border already shows one.
        Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
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
  const [focused, setFocused] = useState(false)
  return (
    <View
      style={[
        styles.input,
        styles.inline,
        { borderColor: focused ? c.brand : c.border, backgroundColor: c.card },
      ]}
    >
      <Feather name="search" size={18} color={c.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder ?? t('common.search')}
        placeholderTextColor={c.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[
          { flex: 1, color: c.foreground, fontSize: 15, paddingVertical: 0 },
          { fontFamily: font(400) },
          // The browser draws its own focus ring; the field already shows one.
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10}>
          <Feather name="x" size={18} color={c.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  )
}

/** A switch in the brand colour. */
export function Toggle({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
  /** Read out by a screen reader; the switch has no visible text of its own. */
  label?: string
}) {
  const { c } = useTheme()
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ false: c.border, true: c.primary }}
      thumbColor="#ffffff"
      ios_backgroundColor={c.border}
      {...(Platform.OS === 'web'
        ? ({ activeThumbColor: '#ffffff', activeTrackColor: c.primary } as object)
        : null)}
    />
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
      <Toggle value={value} onValueChange={onValueChange} disabled={disabled} label={label} />
    </View>
  )
}

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive'

/**
 * A status, as a soft pill: the colour is a tint behind its own ink, never a
 * hard outline. `tone` carries meaning (good, late, waiting); without one the
 * `variant` only says how loud it is.
 */
export function Badge({
  label,
  variant = 'secondary',
  tone,
}: {
  label: string
  variant?: BadgeVariant
  tone?: Tone
}) {
  const { c, dark } = useTheme()
  const ink = tone
    ? c.tone[tone]
    : variant === 'default'
      ? c.brand
      : variant === 'destructive'
        ? c.destructive
        : variant === 'outline'
          ? c.mutedForeground
          : c.foreground
  const bg = tone
    ? soft(ink, dark)
    : variant === 'default'
      ? c.brandSoft
      : variant === 'destructive'
        ? soft(c.destructive, dark)
        : variant === 'outline'
          ? 'transparent'
          : c.muted
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderColor: variant === 'outline' && !tone ? c.border : 'transparent',
        },
      ]}
    >
      <Text
        style={{ color: ink, fontFamily: font(600), fontSize: 12, letterSpacing: 0.1 }}
        numberOfLines={1}
      >
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
      // Bleeds to the screen's edges, so a long strip scrolls off the side of
      // the phone rather than being cut off at the page margin.
      style={{ flexGrow: 0, marginHorizontal: -20 }}
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: 20 }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
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
                fontFamily: font(600),
                fontSize: 13.5,
              }}
            >
              {o.label}
            </Text>
            {o.count !== undefined ? (
              <Text
                style={{
                  color: on ? c.primaryForeground : c.mutedForeground,
                  fontFamily: font(600),
                  fontSize: 12.5,
                  opacity: on ? 0.85 : 1,
                }}
              >
                {o.count}
              </Text>
            ) : null}
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
  const { c, dark } = useTheme()
  // A dormant figure — nothing overdue, nothing waiting — stays quiet.
  const ink = tone && tone !== 'muted' ? c.tone[tone] : c.foreground
  // A count is two digits; a sum of money is eleven characters and has to
  // fit half a phone's width. `adjustsFontSizeToFit` covers the rest on a
  // device, and does nothing on the web preview.
  const size = value.length <= 6 ? 28 : value.length <= 9 ? 22 : 18
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: c.card, opacity: pressed ? 0.9 : 1 },
        elevation(c, dark),
      ]}
    >
      {/* Two lines: the Malay labels are longer than half a phone is wide. */}
      <T v="small" muted numberOfLines={2} style={{ fontWeight: '500' }}>
        {label}
      </T>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          color: tone === 'muted' ? c.mutedForeground : ink,
          fontFamily: font(800),
          fontSize: size,
          letterSpacing: size > 22 ? -0.8 : -0.4,
          lineHeight: 34,
        }}
      >
        {value}
      </Text>
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
    <View
      style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: 'hidden' }}
    >
      <View
        style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: c.brand }}
      />
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
        backgroundColor: c.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.brand, fontSize: size * 0.36, fontFamily: font(700) }}>
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
      <ActivityIndicator color={c.brand} />
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
    <View style={[styles.center, { gap: space.sm }]}>
      {icon ? <IconTile name={icon} size={56} /> : null}
      <T center style={{ fontWeight: '700', fontSize: 16, marginTop: icon ? 6 : 0 }}>
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
      <IconTile name="alert-circle" size={56} tone="danger" />
      <T center style={{ fontWeight: '600' }}>
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
    <T v="small" tone="danger" style={{ fontWeight: '500' }}>
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
  const { t } = useT()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.card, paddingBottom: Math.max(insets.bottom, space.xl) },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {title ? (
            <View style={styles.sheetHead}>
              <T v="heading" style={{ flex: 1, fontSize: 19 }}>
                {title}
              </T>
              <IconButton name="x" label={t('common.close')} onPress={onClose} />
            </View>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: space.lg }}
          >
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
          {items.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => {
                setOpen(false)
                item.onPress()
              }}
              style={({ pressed }) => [
                styles.menuItem,
                pressed ? { backgroundColor: c.muted } : null,
              ]}
            >
              {item.icon ? (
                <IconTile name={item.icon} tone={item.destructive ? 'danger' : undefined} />
              ) : null}
              <Text
                style={{
                  color: item.destructive ? c.destructive : c.foreground,
                  fontFamily: font(600),
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
          styles.inline,
          { borderColor: c.border, backgroundColor: c.card },
        ]}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: font(selected ? 500 : 400),
            color: selected ? c.foreground : c.mutedForeground,
          }}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder ?? ''}
        </Text>
        <Feather name="chevron-down" size={18} color={c.mutedForeground} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View>
          {options.map((o) => {
            const on = o.value === value
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  setOpen(false)
                  onChange(o.value)
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  on ? { backgroundColor: c.brandSoft } : null,
                  pressed ? { backgroundColor: c.muted } : null,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: on ? '700' : '500', color: on ? c.brand : c.foreground }}>
                    {o.label}
                  </T>
                  {o.hint ? (
                    <T v="small" muted>
                      {o.hint}
                    </T>
                  ) : null}
                </View>
                {on ? <Feather name="check" size={18} color={c.brand} /> : null}
              </Pressable>
            )
          })}
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

  // The web preview has no native picker; the browser's own date input is the
  // same control by another name.
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value: value ?? '',
      min: minimumDate ? toYmd(minimumDate) : undefined,
      max: maximumDate ? toYmd(maximumDate) : undefined,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
      style: {
        minHeight: 52,
        borderRadius: radius.md,
        border: `1px solid ${c.border}`,
        backgroundColor: c.card,
        color: c.foreground,
        padding: '0 14px',
        fontSize: 15,
        fontFamily: font(500),
        colorScheme: 'light dark',
      },
    })
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.input,
          styles.inline,
          { borderColor: c.border, backgroundColor: c.card },
        ]}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: font(value ? 500 : 400),
            color: value ? c.foreground : c.mutedForeground,
          }}
        >
          {value ?? placeholder ?? ''}
        </Text>
        {value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10}>
            <Feather name="x" size={18} color={c.mutedForeground} />
          </Pressable>
        ) : (
          <Feather name="calendar" size={18} color={c.mutedForeground} />
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
            accentColor={c.primary}
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

/**
 * Tell the person something happened. The platform's own alert on a phone; the
 * browser's on the web preview, where React Native's `Alert` does nothing.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title)
    return
  }
  Alert.alert(title, message)
}

/** A yes/no question that changes something. Resolves true on confirm. */
export function confirm(opts: {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title
    return Promise.resolve(globalThis.confirm?.(text) ?? false)
  }
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
  content: { padding: 20, gap: 22 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: space.lg,
    gap: space.md,
  },
  card: {
    borderRadius: radius.lg,
    padding: 18,
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
    paddingVertical: 13,
    minHeight: 64,
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 40, borderRadius: 12, paddingHorizontal: 14, gap: 6 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 40,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.lg,
    padding: 16,
    gap: 2,
    // Tiles in a row share a height; the figures line up along the bottom
    // whether a label took one line or two.
    justifyContent: 'space-between',
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: '#ffffff', fontSize: 9.5 },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(9,9,11,0.5)',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '90%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: space.lg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
    marginTop: -4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
})
