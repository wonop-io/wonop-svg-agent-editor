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

A small canvas-first diagram editor inside Wonop. Its injected package styles and theme tokens are the visual authority. The drawing fills the window, with six essential tools and contextual object actions. Source is secondary, available under File. There is no independent website identity.

**Key Characteristics:**

- Edge-to-edge canvas with a minimal drawing sidebar.
- System typography and restrained controls.
- Explicit unsaved, recovery and error states.

## Colors

Primary colors identify Save and a dialog's confirming action. Neutral content is the source and page background; surface belongs to dialogs; fill separates the toolbar and canvas viewport. Fill-strong supplies quiet button hover, the selected drawing tool and text selection. Text-dim carries filenames, position and secondary labels; hairline divides panes and outlines fields.

**The Host Theme Rule.** Consume Wonop's injected tokens in both themes. CSS fallbacks support an unhosted page; they are not a separate palette. Do not substitute unrecognized surface-level tokens for `--wm-content`, `--wm-surface` or `--wm-fill`.

Light, dark and transparent paper affect only the diagram image. The SVG retains its own colors. Editor selection and gesture outlines use dark ink with a white halo so they remain legible over document colors. Notice tone is semantic: amber for recovery/resource guidance, red for validation and file errors.

## Typography

System body type is the default for labels, controls and status. The app title uses the title role; dialogs use the dialog-title role. Source uses the source role with two-space tabs, preserved whitespace and horizontal scrolling. Position and zoom values use tabular numerals. There is no display typography or syntax-color theme.

## Layout

The window is a fixed-height flex column. A draggable header (44px) reserves space at the right for host window controls; the filename truncates. A compact wrapping toolbar contains Open, File and the primary Save.

The canvas fills the workspace by default. A vertical sidebar (68px) holds Select, Box, Ellipse, Line, Text and Hand, with Undo and Redo at the bottom. Contextual object actions appear above the drawing only when selected; Fit, scale, zoom and Paper remain below it. The scrollable viewport centers the diagram with the canvas spacing token.

File → SVG source reveals a secondary pane (39%, minimum 240px), leaving the larger share for drawing. At widths up to 650px, an open source pane occupies the upper 42%, with canvas below and a horizontal divider. With source hidden, the canvas retains the full workspace at either size. Toolbars wrap rather than disappear; the sidebar remains vertical.

Dialogs are capped at 500px and leave 12px on either side of narrow windows. Draft and object lists scroll at a maximum height of 50vh. Notices occupy their own bottom row and reduce the workspace height.

## Elevation & Depth

Tonal surfaces, fine dividers and the native dialog backdrop establish separation. The File menu alone uses a floating-menu shadow (`0 6px 24px #0003`); the editor canvas adds a small white halo to selection feedback. Wonop owns surrounding window chrome and native tab treatment.

## Shapes

Controls use the control radius, the File menu the menu radius, and dialogs the larger dialog radius. The source textarea and adjoining workspace panes have square edges. Diagram geometry belongs to the document rather than the application UI.

## Components

- **Document toolbar and File menu:** Open and Save stay visible. File contains New diagram, Save as, Recover draft, SVG source, Objects and Discard edits. Save is the one primary window action. Disabled controls lower opacity; source visibility is exposed through `aria-pressed`.
- **Drawing sidebar:** six text-labeled tool buttons; selected tools use fill-strong and semibold type. Select uses a default cursor, drawing tools a crosshair, Hand a grab cursor. Keyboard shortcuts are V/R/E/L/T/H; Undo/Redo operate on the same history as structured agent edits.
- **Canvas and selection:** SVG renders in an isolated `<img>` data URL. An editor-owned `<canvas>` overlays numeric geometry, dashed selection/gesture outlines and resize handles, never document markup. Click to select, drag to move, resize supported primitives with handles; arrows move and brackets cycle objects. Hand pans and modified-wheel zooms. File → Objects provides a keyboard-accessible list.
- **Contextual object actions:** the selected type appears beside Style and Delete. Text also exposes Edit text; double-clicking a text object opens the same edit dialog. Label and style changes use native modal forms with primary Apply; style fields are Fill, Stroke, Stroke width and, for text, Text size. Human and revision-checked structured commands update one document and shared undo history.
- **Secondary source editor:** a plain labeled textarea with line/column position, preserved whitespace, horizontal scrolling and visible focus. Invalid XML stays editable; the last valid image remains when available, with drawing feedback disabled. Conflicting source is retained for recovery rather than silently replacing newer shared edits.
- **Document state and notices:** native tabs receive filename and dirty flag; the header also appends “• Unsaved”. Drafts survive closure/restart. Bottom `wm-notice` explains recovery, unavailable resources, validation or file errors; Go to error reveals and focuses source when a location is known.

## Do's and Don'ts

### Do:

- **Do** inherit Wonop's light/dark tokens and native tab state.
- **Do** keep canvas tools compact, keyboard reachable and visibly focused; keep source secondary.
- **Do** preserve SVG colors independently of the surrounding theme.

### Don't:

- **Don't** add website chrome, a hero section or an independent brand palette.
- **Don't** insert untrusted SVG markup into the live application DOM.
- **Don't** conceal unsaved state, validation failures or draft recovery guidance.
