# Visual SVG foundation decision

Reassessed on 2026-10-21 for WON-887's corrected requirement: humans draw, select, move, resize and label on canvas without source; agents perform structured object operations on the same document/history.

| Foundation | Fit for the corrected scope | Decision |
|---|---|---|
| [SVG-Edit / standalone svgcanvas](https://github.com/SVG-Edit/svgedit) | A real SVG drawing engine intended for custom editor UIs. Its current README explicitly separates canvas from editor chrome and supports recent Safari. | Viable. Embedding it here would require adapting its mutable canvas/history to the existing authoritative revision/draft model. The old source-first rejection does not apply. |
| [SVG.js](https://svgjs.dev/docs/3.2/) | SVG-native library with Matrix/Point/PathArray/PointArray and manipulation APIs; no runtime dependencies, MIT. Provides geometry rather than a finished editor or another history owner. | Chosen and integrated beneath the existing visual drawing tools, so open documents, agent protocol and native UI continue in place. |

The package supplies visual drawing, direct selection/move/resize, text/style controls and shared undo/redo. Its isolate remains authoritative for object CRUD, source-preserving patches, exact revisions, file IO and draft recovery. Source is optional; it is not a prerequisite for human drawing.

SVG.js handles affine composition/inversion and imported path/point bounds. Only transform numbers and path/point command data enter the library. It never imports a document or calls `.svg()`/markup insertion, image-loading or arbitrary attribute APIs. Its native bounds parser creates its own hidden measurement path. Imported document markup stays in an inert image context.

## Vendored dependency

- Package: `@svgdotjs/svg.js@3.2.8` ([upstream metadata](https://github.com/svgdotjs/svg.js/blob/master/package.json)).
- Asset: `ui/vendor/svgjs-3.2.8.min.js`, copied unchanged from `https://cdn.jsdelivr.net/npm/@svgdotjs/svg.js@3.2.8/dist/svg.min.js` (93,525 bytes).
- SHA-256: `90fc33bcba8181aa5e96e5c975da19f0912d7097a4ec9056ba130fc3ce328ec6`.
- License: `ui/vendor/SVGJS-LICENSE.txt` (MIT); the bundle also retains its upstream notice.
- Served locally by Wonop; no runtime CDN request or new network permission.

Twenty Deno tests/API checks and five actual WebKit geometry checks pass. Full drawing/agent integration was previously exercised in a disposable editor; protected current drafts are not disposable test fixtures.
