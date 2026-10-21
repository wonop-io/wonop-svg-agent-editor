# SVG Editor design

Inherits Wonop's established package visual system. Mode: Operate. Build directly from the user's explicit scope, without a concept approval round.

The document is the surface: a 44px draggable header, a quiet file toolbar, and source/preview split to the edges. Native tab titles carry file identity and unsaved state. Preview takes the larger share; a source toggle makes the diagram fill a small window. Narrow windows stack source and preview. All controls remain reachable by keyboard and have visible focus. Source uses system monospace at 13px; other text uses Wonop system type at 13/15px. Injected tokens govern light/dark UI; the diagram's own colors remain intact on a selectable paper background. Errors and recovery guidance appear in a bottom wm-notice.
