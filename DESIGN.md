---
name: SVG Editor
description: A compact canvas-first Wonop SVG diagram editor.
colors:
  content: "var(--wm-content, #fafafa)"
  surface: "var(--wm-surface, var(--wm-content, #fafafa))"
  fill: "var(--wm-fill, #8881)"
  fill-strong: "var(--wm-fill-strong, #8882)"
  text: "var(--wm-text, #242428)"
  text-dim: "var(--wm-text-dim, #73737b)"
  hairline: "var(--wm-hairline, #8883)"
  primary: "var(--wm-primary, #242428)"
  primary-text: "var(--wm-primary-text, #fafafa)"
  paper-light: "white"
  paper-dark: "#18181b"
  selection-ink: "#17171c"
  selection-halo: "white"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
  title:
    fontSize: "15px"
    fontWeight: 600
  source:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    lineHeight: 1.65
  dialog-title:
    fontSize: "20px"
rounded:
  control: "6px"
  dialog: "12px"
  menu: "8px"
spacing:
  control-gap: "2px"
  toolbar-block: "4px"
  toolbar-inline: "8px"
  pane-inline: "12px"
  canvas: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  tool-selected:
    backgroundColor: "{colors.fill-strong}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 4px"
  source-field:
    backgroundColor: "{colors.content}"
    textColor: "{colors.text}"
    typography: "{typography.source}"
    padding: "8px 12px 16px"
---

# Design System: SVG Editor

## Overview

**Creative North Star: "The Native Workbench"**

A small canvas-first diagram editor inside Wonop. Its injected package styles and theme tokens are the visual authority. The drawing fills the window, with six essential tools and contextual object actions. Source is secondary, available through a code icon. There is no independent website identity.

**Key Characteristics:**

- Edge-to-edge canvas with a minimal drawing sidebar.
- System typography and restrained controls.
- Explicit unsaved, recovery and error states.

## Colors

Primary colors identify a dialog's confirming action. Neutral content is the source and page background; surface belongs to dialogs; fill separates the toolbar and canvas viewport. Fill-strong supplies quiet button hover, the selected drawing tool and text selection. Text-dim carries position and secondary labels; hairline divides panes and outlines fields.

**The Host Theme Rule.** Consume Wonop's injected tokens in both themes. CSS fallbacks support an unhosted page; they are not a separate palette. Do not substitute unrecognized surface-level tokens for `--wm-content`, `--wm-surface` or `--wm-fill`.

Light, dark and transparent paper affect only the diagram image. The SVG retains its own colors. Editor selection and gesture outlines use dark ink with a white halo so they remain legible over document colors. Notice tone is semantic: amber for recovery/resource guidance, red for validation and file errors.

## Typography

System body type is the default for labels, controls and status. The host draws document titles; dialogs use the dialog-title role. Source uses the source role with two-space tabs, preserved whitespace and horizontal scrolling. Position and zoom values use tabular numerals. There is no display typography or syntax-color theme.

## Layout

The window is a fixed-height, headerless stage. Wonop draws window chrome and conventional document tabs; there is no duplicate in-app title, filename, file toolbar or File menu. File IO and draft recovery belong to the agent command interface.

The canvas fills the workspace by default. A vertical 44px sidebar holds six 32px icon buttons for Select, Box, Ellipse, Line, Text and Hand, with Undo and Redo below. Icons are 16px, use currentColor and have accessible names and shortcut tooltips. Context actions float over the upper-left canvas only while selected; their appearance never changes viewport bounds or fit scale. Fit, zoom, percentage, the object-list/code icons and a quiet background selector sit at the bottom. The viewport centers the diagram with the canvas spacing token.

The code icon reveals a secondary source pane (39%, minimum 240px). At widths up to 650px, source occupies the upper 42% with canvas below. With source hidden, the canvas uses the full workspace. Toolbars wrap rather than disappear; the sidebar remains vertical.

Dialogs are capped at 500px and leave 12px on either side of narrow windows. Object lists scroll at a maximum height of 50vh. Notices occupy their own bottom row and reduce the workspace height.

## Elevation & Depth

Tonal surfaces, fine dividers and the native dialog backdrop establish separation. Contextual selection controls use a quiet shadow (`0 1px 4px #0002`); the editor canvas adds a small white halo to selection feedback. Wonop owns surrounding window chrome and native tab treatment.

## Shapes

Controls use the control radius and dialogs the larger dialog radius. The source textarea and adjoining workspace panes have square edges. Diagram geometry belongs to the document rather than the application UI.

## Components

- **Native document tabs:** Wonop owns switching, filename, unsaved mark, close protection and restart restore. Agents may open a file in a new tab without replacing the current document. There is no in-app file UI.
- **Drawing sidebar:** six icon buttons; selected tools use fill-strong. Select uses a default cursor, drawing tools a crosshair, Hand a grab cursor. V/R/E/L/T/H and shared Undo/Redo remain available.
- **Canvas and selection:** document SVG renders in an isolated `<img>` data URL. An editor-owned `<canvas>` overlays numeric geometry and resize handles, never document markup. Trusted app icons are the only inline SVG. Click to select, drag to move, resize primitives with handles; arrows move and brackets cycle. The bottom list icon provides keyboard-accessible objects.
- **Contextual object actions:** floating Style/Delete icons; text also exposes Edit text, available by double-click. Native modal forms provide Label or Fill/Stroke/Stroke width/Text size and Apply. Human actions and revision-checked agent commands update one document and history.
- **Secondary source editor:** a plain labeled textarea with line/column position, preserved whitespace, horizontal scrolling and visible focus. Invalid XML stays editable; the last valid image remains when available, with drawing feedback disabled. Conflicting source is retained for recovery rather than silently replacing newer shared edits.
- **Document state and notices:** native tabs receive filename and dirty flag. Drafts survive closure/restart. Bottom `wm-notice` explains recovery, unavailable resources, validation or file errors; Go to error reveals and focuses source when a location is known.

## Do's and Don'ts

### Do:

- **Do** inherit Wonop's light/dark tokens and native tab state.
- **Do** keep canvas tools compact, keyboard reachable and visibly focused; keep source secondary.
- **Do** preserve SVG colors independently of the surrounding theme.

### Don't:

- **Don't** add website chrome, a hero section or an independent brand palette.
- **Don't** insert untrusted SVG markup into the live application DOM.
- **Don't** conceal unsaved state, validation failures or draft recovery guidance.
