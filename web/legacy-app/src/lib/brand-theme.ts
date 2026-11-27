const LIGHT_BACKGROUND = '#f5f6f9'
const DARK_BACKGROUND = '#0e1013'
const LIGHT_SURFACE = '#ffffff'
const DARK_SURFACE = '#16181d'
const LIGHT_INK = '#101323'
const DARK_INK = '#ffffff'

type RGB = { red: number; green: number; blue: number }
type ThemeRoot = Pick<HTMLElement, 'dataset' | 'style'>

export type BrandThemeInput = {
  themeColor: string
}

const LIGHT_TOKEN_NAMES = [
  'primary',
  'primary-hover',
  'primary-pressed',
  'primary-foreground',
  'accent',
  'accent-foreground',
  'ring',
  'chart-1',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
] as const

export const BRAND_THEME_VARIABLES = [
  ...LIGHT_TOKEN_NAMES.map((name) => `--brand-${name}`),
  ...LIGHT_TOKEN_NAMES.map((name) => `--brand-${name}-dark`),
]

export function normalizeBrandColor(value: string) {
  const normalized = value.trim().toLowerCase()
  const shortHex = /^#([0-9a-f]{3})$/.exec(normalized)
  if (shortHex) {
    return `#${[...shortHex[1]].map((character) => character.repeat(2)).join('')}`
  }
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null
}

function parseHex(color: string): RGB {
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  }
}

function toHex({ red, green, blue }: RGB) {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

function mixColors(from: string, to: string, amount: number) {
  const start = parseHex(from)
  const end = parseHex(to)
  return toHex({
    red: start.red + (end.red - start.red) * amount,
    green: start.green + (end.green - start.green) * amount,
    blue: start.blue + (end.blue - start.blue) * amount,
  })
}

function relativeLuminance(color: string) {
  const { red, green, blue } = parseHex(color)
  const linearize = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
}

export function getContrastRatio(first: string, second: string) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function ensureContrast(color: string, background: string, minimum: number, target: string) {
  if (getContrastRatio(color, background) >= minimum) return color
  for (let step = 1; step <= 50; step += 1) {
    const candidate = mixColors(color, target, step / 50)
    if (getContrastRatio(candidate, background) >= minimum) return candidate
  }
  return target
}

function foregroundFor(background: string) {
  const lightContrast = getContrastRatio(background, DARK_INK)
  const darkContrast = getContrastRatio(background, LIGHT_INK)
  return lightContrast >= darkContrast ? DARK_INK : LIGHT_INK
}

function interactionColors(primary: string, foreground: string) {
  const target = foreground === DARK_INK ? '#000000' : '#ffffff'
  return {
    hover: mixColors(primary, target, 0.08),
    pressed: mixColors(primary, target, 0.16),
  }
}

function buildModeTokens(primary: string, background: string, surface: string, contrastTarget: string, dark = false) {
  const accessiblePrimary = ensureContrast(primary, background, 3, contrastTarget)
  const primaryForeground = foregroundFor(accessiblePrimary)
  const interaction = interactionColors(accessiblePrimary, primaryForeground)
  const accent = mixColors(surface, accessiblePrimary, dark ? 0.2 : 0.1)
  const accentForeground = ensureContrast(accessiblePrimary, accent, 4.5, contrastTarget)

  return {
    primary: accessiblePrimary,
    'primary-hover': interaction.hover,
    'primary-pressed': interaction.pressed,
    'primary-foreground': primaryForeground,
    accent,
    'accent-foreground': accentForeground,
    ring: accessiblePrimary,
    'chart-1': accessiblePrimary,
    'sidebar-primary': accessiblePrimary,
    'sidebar-primary-foreground': primaryForeground,
    'sidebar-accent': accent,
    'sidebar-accent-foreground': accentForeground,
  }
}

export function buildBrandTheme(value: string) {
  const color = normalizeBrandColor(value)
  if (!color) return null

  const light = buildModeTokens(color, LIGHT_BACKGROUND, LIGHT_SURFACE, LIGHT_INK)
  const dark = buildModeTokens(color, DARK_BACKGROUND, DARK_SURFACE, DARK_INK, true)
  const variables: Record<string, string> = {}

  for (const name of LIGHT_TOKEN_NAMES) {
    variables[`--brand-${name}`] = light[name]
    variables[`--brand-${name}-dark`] = dark[name]
  }
  return variables
}

export function clearBrandTheme(root: ThemeRoot = document.documentElement) {
  for (const variable of BRAND_THEME_VARIABLES) root.style.removeProperty(variable)
  delete root.dataset.brandTheme
}

export function applyBrandTheme(input: BrandThemeInput, root: ThemeRoot = document.documentElement) {
  clearBrandTheme(root)
  const variables = buildBrandTheme(input.themeColor)
  const color = normalizeBrandColor(input.themeColor)
  if (!variables || !color) return

  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value)
  root.dataset.brandTheme = color
}
