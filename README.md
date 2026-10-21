# SVG Editor

A small canvas-first Wonop SVG editor for architecture diagrams. Select and manipulate objects directly; draw boxes, ellipses, lines and text with six essential tools. SVG source is available through the code icon as a secondary tool. Humans and agents operate on the same SVG document and undo history.

## Use

Use the six icon tools in the sidebar: select, box, ellipse, line, text and hand. Every icon has an accessible name and a tooltip with its shortcut. Choose a shape and drag on the page, or choose text and click to place a label. Select an object to drag it, resize a box/ellipse/circle/line with its corner handles, edit a text label, change its style or delete it. Double-click text to edit it. Use Hand to pan, Fit or the percentage control for scale, and control-scroll/pinch to zoom. New diagrams start with a blank page.

Keyboard: V Select, R Box, E Ellipse, L Line, T Text, H Hand; arrow keys move selected objects (Shift for ten units), brackets cycle objects, Delete removes, Escape clears selection. Command/Ctrl Z and Shift Command/Ctrl Z undo/redo shared edits. The list icon opens a keyboard-accessible object list. The code icon toggles source. The host supplies native document tabs, filenames and unsaved marks; there is no duplicate title bar or file toolbar.

Agents open and save files, recover drafts and perform explicit discard through commands. `save({})` writes the current path; `save({path})` chooses a new destination and refuses existing files. Native tabs mark unsaved work and protect closure; drafts survive reload/restart. Invalid XML remains editable in the optional source pane with the last valid image. Conflicting source edits are retained as recovery drafts rather than replacing a newer agent/human edit.

## Structured agent interface

`open({path,newTab:true,windowId?})` reads an SVG into a new native tab in the target window, preserving all existing documents and drafts. `newTab({path?,windowId?})` opens a blank or file-backed tab. Both return document state plus `windowId` and `hostId`. Use `tabs({})` to list stable tab IDs, names, hosts and dirty marks. Pass a tab's stable ID as `windowId` to document commands; omit it for the tab resolved by the host. Ordinary `open({path})` replaces only a clean current document. The native tab strip provides conventional switching, adding and guarded closing; no custom tab strip is drawn.

```ts
const tab = await wm.apps['svg-editor'].open({path: 'architecture.svg', newTab: true});
const current = await wm.apps['svg-editor'].state({windowId: tab.windowId});
// After editing, choose a fresh filename; the existing file is never overwritten here.
await wm.apps['svg-editor'].save({windowId: tab.windowId, path: 'architecture-revised.svg'});
```

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

Reassessed for the corrected visual scope: [SVG-Edit](https://github.com/SVG-Edit/svgedit) offers the standalone `@svgedit/svgcanvas` engine specifically for custom visual drawing editors. It is a viable foundation, rather than merely a source-editor alternative. This existing package uses [SVG.js](https://svgjs.dev/docs/3.2/) **3.2.8** for SVG-native transform/point/path geometry beneath its working visual tools. SVG.js is an MIT-licensed library with no runtime dependencies, not a ready-made editor UI. The package supplies the minimal native Wonop controls and the shared object command/history layer. SVG-Edit's canvas would require a separate adaptation of that existing authoritative state/history; SVG.js fits incrementally without replacing open documents. See [FOUNDATIONS.md](FOUNDATIONS.md) for the decision and pinned local asset.

The local SVG.js bundle supplies matrix composition/inversion, movement coordinates and native curve/arc bounds. Imported path selection no longer mistakes control-point pairs or arc flags for bounding coordinates. The optional plain source view is secondary and is not the visual editor foundation.

The SVG itself is rendered only as an `<img>` data URL. Untrusted markup is never inserted into the app DOM, iframe or object. The overlay draws only numeric geometry, selection and gesture outlines. [SVG image-context restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) disable script and external resources; DTD/entity declarations are refused before parsing. Structured commands allow only drawing primitives and safe properties; text/attribute values are escaped. This retains the boundary used in Wonop's Markdown example. WON-836 remains separate image-viewer/collection work; Excalidraw is outside this package.

No network or AI grants. Existing approved file commands perform bounded reads and staged saves, with disk-conflict checks and non-overwriting Save as. Files are limited to 200 KB UTF-8. The check/rename race is documented: this is not an OS compare-and-swap. Saving replaces a symlink itself and new files have private temporary-file permissions.

Simple primitives and SVG attribute transforms are editable; imported paths/polygons can be selected, moved, styled and deleted. Path selection uses native SVG bounds; text bounds remain approximate. Advanced CSS selectors/transforms, nested SVG viewports, text-on-path, grouping, rotation tools, path-node editing and vector-suite features are outside scope; retain/edit their source as needed. External images, stylesheets and fonts are intentionally unavailable in preview.

## Verification

`deno task ci` / Wonop `package_test` cover the real entry with a stubbed host and API type checks. `tests/preview-check.js`, `tests/geometry-check.js` and `tests/visual-check.js` provide native-WebKit assertions, including pointer gestures and shared human/agent operations. The optional local HTTP harness may be run with the command at the top of `tests/browser-check.ts` where port binding is allowed. See VALIDATION.md for the latest actual run and its limits.
