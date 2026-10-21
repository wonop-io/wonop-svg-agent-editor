# SVG Editor

A small canvas-first Wonop SVG editor for architecture diagrams. Select and manipulate objects directly; draw boxes, ellipses, lines and text with six essential tools. SVG source is available under File as a secondary tool. Humans and agents operate on the same SVG document and undo history.

## Use

Open a local `.svg` with Open. Choose Box, Ellipse or Line and drag on the page. Choose Text and click to place a label. Select an object to drag it, resize a box/ellipse/circle/line with its corner handles, edit a text label, change its style or delete it. Double-click text to edit it. Use Hand to pan, Fit or 100% for scale, and control-scroll/pinch to zoom. New diagrams start with a blank page.

Keyboard: V Select, R Box, E Ellipse, L Line, T Text, H Hand; arrow keys move selected objects (Shift for ten units), brackets cycle objects, Delete removes, Escape clears selection. Command/Ctrl Z and Shift Command/Ctrl Z undo/redo shared edits. File → Objects provides a keyboard-accessible object list. File also contains Save as, source, draft recovery and explicit discard.

Save writes SVG, with source changes from either interface. Save as refuses existing destinations. Native tabs mark unsaved work and protect closure; drafts survive reload/restart. Invalid XML remains editable in the optional source pane with the last valid image. Conflicting source edits are retained as recovery drafts rather than replacing a newer agent/human edit.

## Structured agent interface

Read `wm.apps["svg-editor"].objects({ windowId? })` for `{ documentId, revision, viewBox, objects, error }`. Objects include `key`, `type`, raw SVG `attributes`, text, presentation and ancestor transforms. Keys without unique SVG IDs are revision-scoped; read again after edits. Each mutation requires the exact `documentId` and `expectedRevision` returned by objects/state.

```ts
const drawing = await wm.apps['svg-editor'].objects({});
const added = await wm.apps['svg-editor'].add({
  documentId: drawing.documentId, expectedRevision: drawing.revision,
  type: 'rect', x: 80, y: 100, width: 180, height: 100,
  fill: '#f1f5f9', stroke: '#475569'
});
await wm.apps['svg-editor'].move({
  documentId: added.id, expectedRevision: added.revision,
  key: added.selectedKey, dx: 40, dy: 0
});
```

Commands: `add` (rect/ellipse/line/text), `set` (one geometry, fill, stroke, opacity, font-size or text property), `move`, `resize`, `remove`, `undo`, `redo`. Coordinates use SVG units. Move deltas are in the object's parent coordinates; resize geometry is local to the object. Lines use signed width/height as endpoint deltas. `state` includes source and the current scene; `open`, `save`, `newDocument`, `discard` and `recover` retain their file/document roles. Advanced raw `edit` also requires `expectedRevision`, `id`, the next `revision`, and `text`.

Stale mutations fail before changing the shared SVG. Each accepted edit updates source, safe image preview, draft state and history. Visual edits patch only the affected element or insert a new element, preserving unedited definitions, gradients, styles, metadata and other markup. Text replacement intentionally replaces that label's inner spans. Undo/redo uses bounded source snapshots.

## Lightweight foundation and safety

[SVG-Edit](https://github.com/SVG-Edit/svgedit) provides a drawing suite and reusable canvas; its full editor/build system exceeds this package's deliberately small scope. [CodeMirror](https://codemirror.net/) is a sensible future source-editor upgrade. The existing package is extended with dependency-free editor controls, a source-preserving XML model in its isolate and an editor-owned canvas overlay; no separate document or illustration framework is introduced.

The SVG itself is rendered only as an `<img>` data URL. Untrusted markup is never inserted into the app DOM, iframe or object. The overlay draws only numeric geometry, selection and gesture outlines. [SVG image-context restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) disable script and external resources; DTD/entity declarations are refused before parsing. Structured commands allow only drawing primitives and safe properties; text/attribute values are escaped. This retains the boundary used in Wonop's Markdown example. WON-836 remains separate image-viewer/collection work; Excalidraw is outside this package.

No network or AI grants. Existing approved file commands perform bounded reads and staged saves, with disk-conflict checks and non-overwriting Save as. Files are limited to 200 KB UTF-8. The check/rename race is documented: this is not an OS compare-and-swap. Saving replaces a symlink itself and new files have private temporary-file permissions.

Simple primitives and SVG attribute transforms are editable; imported paths/polygons can be selected, moved, styled and deleted. Path selection bounds and text bounds are approximate. Advanced CSS selectors/transforms, nested SVG viewports, text-on-path, grouping, rotation tools, path-node editing and vector-suite features are outside scope; retain/edit their source as needed. External images, stylesheets and fonts are intentionally unavailable in preview.

## Verification

`deno task ci` / Wonop `package_test` cover the real entry with a stubbed host and API type checks. `tests/preview-check.js` and `tests/visual-check.js` provide native-WebKit assertions, including pointer gestures and shared human/agent operations. The optional local HTTP harness may be run with the command at the top of `tests/browser-check.ts` where port binding is allowed. See VALIDATION.md for the latest actual run and its limits.
