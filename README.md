# SVG Editor

A small Wonop package for local architecture diagrams: edit SVG source beside a live preview, fit/zoom/pan, and save the original source without reformatting it.

## Foundation choice (WON-887)

- [SVG-Edit](https://github.com/SVG-Edit/svgedit) is an MIT drawing editor and reusable SVG canvas. Its shape tools, extensions and build pipeline exceed this source-editing task.
- [CodeMirror](https://codemirror.net/) is an MIT editor with XML support, search and highlighting. A sensible upgrade if editing needs grow; a native textarea keeps this first version dependency-free and preserves normal selection/undo.
- [SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) documents image-context restrictions: no script and no external resources. Preview uses an SVG data URL only in an `img`; untrusted SVG is never inserted into the application DOM or an iframe/object. XML is parsed in a detached document solely for validation. DTDs/entities are refused before parsing.
- Wonop's `example-markdown` docs already use this image-context boundary. WON-836 is still a backlog viewer proposal; no implemented viewer contract is exposed to reuse inside a split source editor. This package adds only the small preview controls needed here, and does not implement image collections or Excalidraw.

## Use

Open a workspace-relative or absolute `.svg` path in the Open sheet, or call `wm.apps["svg-editor"].open({ path })`. Edit source; preview updates after a short pause. Fit, 100%, zoom buttons, pinch/control-scroll and drag-to-pan support large diagrams. Save writes the source exactly as edited; Save as refuses an existing destination.

Unsaved documents are marked in native tabs, which protect closing. Every edit is also kept in the package store for recovery after reload/restart; the Drafts sheet can recover a closed draft. Opening or creating over unsaved edits is refused until Save or an explicit Discard. Invalid XML stays editable and recoverable; the preview reports the parser error and retains the last valid image. Invalid source can be saved deliberately (with an explicit warning in the UI).

## File and safety boundaries

No network or AI permissions. File IO uses narrowly shaped built-in commands because `app` has no filesystem API: bounded `head` reads, `mktemp`, `tee` with stdin, `mv` and temporary-file cleanup. Files are limited to 200 KB of UTF-8. Writes use a sibling temporary file and rename; an unchanged-on-disk check protects normal concurrent edits. The check/rename has a small race window and is not an OS compare-and-swap. Save as uses `mv -n` and verifies the outcome so existing files are not overwritten. Paths must end in `.svg`. A save replaces a symlink itself rather than following it, and a new file uses private temporary-file permissions. Relative references and external fonts/images are intentionally unavailable in previews; inline SVG geometry, text, styles, gradients and markers work.

Run `deno task ci` or Wonop `package_test`. Browser checks exercise the real preview and malicious SVG fixtures. The optional sample test uses a copy of `memory-architecture.svg`; its original is never written.
