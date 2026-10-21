---
name: SVG Editor
description: A compact native Wonop workspace for SVG source and preview.
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
  source-field:
    backgroundColor: "{colors.content}"
    textColor: "{colors.text}"
    typography: "{typography.source}"
    padding: "8px 12px 16px"
---

# Design System: SVG Editor

## Overview

**Creative North Star: "The Native Workbench"**

A small editor inside Wonop. Its injected package styles and theme tokens are the visual authority. The document fills the window, with compact controls and live visual feedback. There is no independent website identity.

**Key Characteristics:**

- Edge-to-edge working surfaces.
- System typography and restrained controls.
- Explicit unsaved, recovery and error states.

## Colors

Primary colors identify Save and a dialog's confirming action. Neutral content is the source and page background; surface belongs to dialogs; fill separates the toolbar and preview viewport. Fill-strong supplies quiet button hover and text selection. Text-dim carries filenames, position and secondary labels; hairline divides panes and outlines fields.

**The Host Theme Rule.** Consume Wonop's injected tokens in both themes. CSS fallbacks support an unhosted page; they are not a separate palette. Do not substitute unrecognized surface-level tokens for `--wm-content`, `--wm-surface` or `--wm-fill`.

Light, dark and transparent paper affect only the diagram image. The SVG retains its own colors. Notice tone is semantic: amber for recovery/resource guidance, red for validation and file errors.

## Typography

System body type is the default for labels, controls and status. The app title uses the title role; dialogs use the dialog-title role. Source uses the source role with two-space tabs, preserved whitespace and horizontal scrolling. Position and zoom values use tabular numerals. There is no display typography or syntax-color theme.

## Layout

The window is a fixed-height flex column. A draggable header (44px) reserves space at the right for host window controls; the filename truncates. A wrapping document toolbar follows, with Save at the end.

The remaining workspace splits source (39%, minimum 240px) and preview. Pane headings and preview controls have a minimum height of 36px. Source scrolls within its textarea; preview scrolls within its own viewport, with diagram padding supplied by the canvas spacing token.

At widths up to 650px, source occupies the upper 42% and preview the remainder; the divider becomes horizontal. Source can be hidden at either size, giving the preview the workspace. Toolbars wrap rather than disappear.

Dialogs are capped at 500px and leave 12px on either side of narrow windows. Draft lists scroll at a maximum height of 50vh. Notices occupy their own bottom row and reduce the workspace height.

## Elevation & Depth

The package adds no decorative shadows. Tonal surfaces, fine dividers and the native dialog backdrop establish separation. Wonop owns the surrounding window chrome and native tab treatment.

## Shapes

Controls use the control radius; dialogs use the larger dialog radius. The source textarea and adjoining workspace panes have square edges. Diagram geometry belongs to the document rather than the application UI.

## Components

- **Document toolbar:** quiet Open, New, Drafts, Source, Discard edits and Save as controls, with one primary Save. Disabled controls lower opacity. Source exposes its visibility through `aria-pressed`.
- **Source editor:** a plain labeled textarea, with line/column position, a visible focus boundary and a caret matching text. It remains editable when validation fails.
- **Preview:** an isolated `<img>` data URL, never SVG markup injected into the page. Fit, actual size and zoom controls accompany a Paper selector. The viewport supports drag panning, modified-wheel zoom and keyboard zoom; its cursor changes while dragging.
- **File and draft dialogs:** native modal dialogs with compact text, labeled path input where relevant, and right-aligned actions. Draft rows are text buttons; the current draft is disabled.
- **Document state:** Wonop's native tab receives the filename and dirty flag; the header also appends “• Unsaved”. Drafts remain recoverable after closure or restart.
- **Notice:** the host's `wm-notice` appears below the workspace. It explains unsaved recovery, unavailable external resources or failures. Invalid source retains the last valid preview when available; “Go to error” reveals and focuses the source location when known.

## Do's and Don'ts

### Do:

- **Do** inherit Wonop's light/dark tokens and native tab state.
- **Do** keep document controls compact, keyboard reachable and visibly focused.
- **Do** preserve SVG colors independently of the surrounding theme.

### Don't:

- **Don't** add website chrome, a hero section or an independent brand palette.
- **Don't** insert untrusted SVG markup into the live application DOM.
- **Don't** conceal unsaved state, validation failures or draft recovery guidance.
