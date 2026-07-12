# Design System

## Visual direction

The storefront uses warm minimalism: off-white backgrounds, white surfaces, subtle borders, restrained shadows, clear typography, and small legacy accent details.

## Tokens

Token files live in `src/design/tokens`:

- `colors.css`
- `typography.css`
- `spacing.css`
- `radius.css`
- `shadows.css`
- `breakpoints.css`

Theme files live in `src/design/themes`:

- `default.theme.css`
- `balloons.theme.css`
- `holiday.theme.css`
- `premium.theme.css`

## Presets

Grid, section, card, and button presets live in `src/design/presets`. Product grid changes should happen in presets or admin settings, not inside individual page files.

## Accent rule

Legacy red, yellow, blue, cyan, green, and navy are accents only. They should be used for badges, small lines, hover states, category marks, holiday accents, balloon highlights, and active states.
