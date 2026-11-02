# Al Maha Farm Management System - Design System

## Color Palette

### Primary Colors (Warm Green - Agriculture Theme)
- **Primary Main**: `#3d7c4f` (Earthy Green)
- **Primary Light**: `#5a9e6b` (Soft Green)
- **Primary Dark**: `#2d6a3f` (Deep Green)

### Secondary Colors (Indigo - Accent)
- **Secondary Main**: `#6366f1` (Indigo 500)
- **Secondary Light**: `#818cf8` (Indigo 400)
- **Secondary Dark**: `#4f46e5` (Indigo 600)

### Semantic Colors
- **Success**: `#3d7c4f` (Primary green)
- **Warning**: `#e8913a` (Warm orange)
- **Error**: `#dc3545` (Red)
- **Info**: `#3b82f6` (Blue 500)

### Background Colors
- **Default**: `#faf8f5` (Warm cream)
- **Paper**: `#ffffff` (White)
- **Muted**: `#f5f3f0` (Warm light grey)

### Text Colors
- **Primary**: `#1a1a1a` (Near-black, warm)
- **Secondary**: `#6b7280` (Warm grey)
- **Disabled**: `#9ca3af` (Light grey)

### Borders
- **Subtle**: `#e8e5e0` (Warm border)
- **Hover**: `#d6d3ce` (Slightly darker on hover)

### Dark Mode
Dark mode uses the same warmth shift:
- **Background**: `#1a1714` / `#262320`
- **Text**: `#f5f0eb` / `#a8a29e`
- **Primary**: `#5a9e6b` / `#7dc08d`
- **Divider**: `#3d3a36`

## Typography Scale

Font family: `Inter`, system-ui fallbacks

| Variant | Font Size | Font Weight | Line Height | Use Case |
|---------|-----------|-------------|-------------|----------|
| h1 | 2.25rem (36px) | 700 | 1.2 | Main page titles |
| h2 | 1.875rem (30px) | 700 | 1.25 | Section titles |
| h3 | 1.5rem (24px) | 600 | 1.3 | Subsection titles |
| h4 | 1.25rem (20px) | 600 | 1.35 | Card titles, page headers |
| h5 | 1.1rem (17.6px) | 600 | 1.4 | Form section titles |
| h6 | 0.95rem (15.2px) | 600 | 1.5 | Table headers, small titles |
| body1 | 0.875rem (14px) | 400 | 1.6 | Body text, paragraphs |
| body2 | 0.8125rem (13px) | 400 | 1.55 | Secondary text, descriptions |
| caption | 0.75rem (12px) | 500 | 1.5 | Labels, helper text |
| button | 0.8125rem (13px) | 500 | 1.75 | Button text (no uppercase) |
| overline | 0.6875rem (11px) | 600 | 1.5 | Section labels, uppercase |

## Spacing Scale

Base unit: **4px**

| Multiplier | Value | Use Case |
|------------|-------|----------|
| 0.5 | 2px | Tight spacing |
| 1 | 4px | Minimal spacing |
| 2 | 8px | Small spacing |
| 3 | 12px | Medium-small spacing |
| 4 | 16px | Medium spacing |
| 6 | 24px | Large spacing |
| 8 | 32px | Extra large spacing |
| 12 | 48px | Section spacing |

## Component Styling

### Buttons
- Border radius: 8px
- Padding: 8px 16px
- Text transform: none (no uppercase)
- Font weight: 500
- Elevation: none (flat)
- Primary: solid green `#3d7c4f`, hover `#2d6a3f`
- Outlined: warm border, hover fills `#f5f3f0`

### Cards & Papers
- Border radius: 12px
- Border: 1px solid `#e8e5e0`
- Box shadow: none (flat)
- Hover: border darkens to `#d6d3ce`

### Text Fields
- Border radius: 8px
- Border: 1px solid `#e8e5e0`
- Focus: green border + soft green ring `0 0 0 3px rgba(61,124,79,0.1)`

### Tables
- Header background: `#f5f3f0`
- Header font: 0.6875rem, uppercase, weight 600
- Cell padding: 10px 16px
- Row hover: `#faf8f5`

### Sidebar
- White background, warm border-right
- Section labels: uppercase overline headings (GENERAL, DATA ENTRY, etc.)
- Active item: soft green fill `rgba(61,124,79,0.1)` + green text
- Icons: 18px, secondary grey, green when active

### AppBar / Topbar
- White background, bottom border
- Visible search bar (click opens command palette)
- Right side: notification bell + user avatar with name/role
- Theme toggle and language switcher inside user dropdown

## Theme File Location
`src/theme.js` - Contains the complete theme configuration via `createAppTheme(mode, direction)`

## Application
The theme is applied globally via `AppThemeProvider` in `src/contexts/ThemeContext.js`
which wraps MUI `ThemeProvider` and supports light/dark/system modes + RTL.
