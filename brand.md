# Brand — Perps

_Status: active · Based on the Base brand system (https://brand.base.org), adapted for a dark trading product. Perps uses its own mark; it does not use the Base Square, Basemark, or logotype, and does not claim affiliation with Base._

## Principles
- Grayscale first. Negative space and grays carry the layout; color is a spotlight.
- Base Blue appears on the single most important action per view (primary button, active selection). Never as large fills or body text on dark.
- Flat: no gradients, glows, colored shadows, blur, or decorative transparency.
- Buy/sell colors are reserved for direction, PnL, and their actions.

## Color (tokens in `apps/web/src/app/globals.css`)
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0A0B0D` (Gray 100) | App background |
| `card` / `panel` / `raise` | `#111215` / `#16171B` / `#1D1F24` | Surface levels (product-derived darks) |
| `line` / `line-strong` | `#23252B` / `#32353D` (Gray 80) | Borders, dividers |
| `fg` | `#EEF0F3` (Gray 10) | Primary text |
| `dim` | `#B1B7C3` (Gray 30) | Secondary text (AA on all surfaces) |
| `subtle` | `#717886` (Gray 50) | Placeholders, footnotes only |
| `muted` | `#5B616E` (Gray 60) | Decorative, never text that must be read |
| `accent` | `#0000FF` (Base Blue) | Primary button fill with white text |
| `accent-hover` | `#0000D6` | Primary button hover |
| `link` | `#3C8AFF` (Cerulean) | Links, focus rings, active indicators on dark |
| `buy` | `#66C800` (Green) | Long, positive PnL. Text on it: `bg` (dark) |
| `sell` | `#FC401F` (Red) | Short, negative PnL, errors. Text on it: `bg` (dark) |
| `warn` | `#FFD12F` (Yellow) | Warnings (e.g. liquidation price, Caps Lock) |

Rules: Base Blue on near-black fails contrast — use `link` for colored text/rings. White text on Green fails AA — use dark text on buy/sell fills. Max one accent color per region.

## Typography
Base Sans/Mono are proprietary; Perps uses Base's documented fallbacks via `next/font`.
- **Inter Tight** (`font-display`): headlines, Medium, tracking −2% to −3%, leading 100–110%. Title Case.
- **Inter** (`font-sans`): UI and body, Regular/Medium, leading 140%.
- **Roboto Mono** (`font-mono`): prices, sizes, metadata. Always tabular numerals.
- **No forced uppercase.** Labels, table headers, tabs, and eyebrows are written in Title Case ("Mark Price", "Open Interest") — never the `uppercase` class or all-caps text. Ticker symbols (BTC-PERP) stay as-is.
- **Minimum size: 12px everywhere** (`text-xs`). Never use 9–11px, including labels, badges, and table headers.
- **Doto** (`font-pixel`): optional, large display only (≥32px), all caps, never for small text or paragraphs.

## Shape & spacing
- Radius: `rounded-md` (6px) controls/icons, `rounded-lg` (8px) inputs, buttons, cards. No pills except status dots.
- Tailwind spacing scale only; no arbitrary pixel padding.
- Hit targets ≥ 40px.

## Motion
- 120–240ms, one curve: `cubic-bezier(0.4, 0, 0.2, 1)` (`--ease-base`, Tailwind default).
- Micro feedback 150ms; enter 240ms; nothing over 800ms.
- Every animation communicates state. No motion blur, no 3D. Reduced motion disables all animation.

## Logo
- Mark: white rounded tile (28px grid, 6px radius) with a Base Blue bar and a black bar (long/short). Wordmark "Perps" in Inter Tight Semibold, −3% tracking. Component: `components/brand/Logo.tsx`; favicon `app/icon.svg`.
- Mark always left of wordmark. Don't recolor, add effects, or place on busy imagery.

## Voice
Clear, direct, optimistic, active voice. Benefit first, tech second. Title Case headlines; sentence case for helper text and buttons' secondary copy. Oxford comma. Spell out zero–nine, digits for 10+. Avoid: "gains", "profits", investment advice, unverified superlatives ("the best"), all caps marketing, more than one emoji, and implying a partnership with Base.
