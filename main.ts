// Classic script; the isolate owns documents and durable recovery, not the page.
interface SvgDocument {
  id: string;
  path: string;
  text: string;
  savedText: string;
  revision: number;
}
interface SvgStore {
  documents: Record<string, SvgDocument>;
  windows: Record<string, string>;
}
const MAX_BYTES = 200_000;
const STARTER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">\n  <rect width="800" height="500" fill="white"/>\n  <rect x="80" y="180" width="240" height="100" rx="12" fill="#f1f5f9" stroke="#475569"/>\n  <text x="200" y="238" text-anchor="middle" font-family="system-ui" font-size="24" fill="#0f172a">Service</text>\n  <path d="M320 230H480" fill="none" stroke="#475569" stroke-width="2"/>\n  <rect x="480" y="180" width="240" height="100" rx="12" fill="#f1f5f9" stroke="#475569"/>\n  <text x="600" y="238" text-anchor="middle" font-family="system-ui" font-size="24" fill="#0f172a">Storage</text>\n</svg>\n';
const kept = app.store.get();
const svgStore: SvgStore = kept?.documents && kept?.windows ? kept : { documents: {}, windows: {} };
const busy = new Set<string>();
const active = new Set<string>();
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}
function bytes(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    n += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
  }
  return n;
}
function checkedText(text: unknown, limit = MAX_BYTES): string {
  if (typeof text !== 'string') fail('invalid_args', 'SVG source must be text.');
  if (bytes(text) > limit) fail('invalid_args', 'This editor supports SVG files up to 200 KB. Reduce the file size first.');
  return text;
}
function filePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f]/.test(value)) fail('invalid_args', 'Enter a local SVG file path.');
  const raw = value.trim();
  if (!/\.svg$/i.test(raw)) fail('invalid_args', 'Choose a file ending in .svg.');
  const sources = typeof workspace !== 'undefined' ? (workspace as any)?.sources ?? [] : [];
  const root = sources.find((s: any) => s.primary)?.path ?? sources[0]?.path;
  const full = raw.startsWith('/') ? raw : root ? `${root}/${raw}` : `./${raw}`;
  const parts: string[] = [];
  for (const part of full.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length && parts[parts.length - 1] !== '..') parts.pop();
    else if (part !== '..' || !full.startsWith('/')) parts.push(part);
  }
  const normalized = `${full.startsWith('/') ? '/' : './'}${parts.join('/')}`;
  return normalized;
}
function title(doc: SvgDocument): string { return doc.path.split('/').pop() || 'Untitled.svg'; }
function dirty(doc: SvgDocument): boolean { return doc.text !== doc.savedText; }
function persist(): void { app.store.set(svgStore); }
function createDocument(): SvgDocument {
  const doc = { id: `d${Date.now()}-${Math.random().toString(36).slice(2)}`, path: '', text: STARTER, savedText: STARTER, revision: 0 };
  svgStore.documents[doc.id] = doc;
  return doc;
}
function target(args: { windowId?: string } = {}, ctx?: CommandCtx): string {
  const id = args.windowId || ctx?.windowId;
  if (!id || !svgStore.windows[id]) fail('not_found', 'Open an SVG Editor window first.');
  return id;
}
function documentFor(id: string): SvgDocument { return svgStore.documents[svgStore.windows[id]]; }
function drafts() {
  return Object.values(svgStore.documents).filter(dirty).map(d => ({ id: d.id, name: title(d), path: d.path }));
}
function state(id: string) { const doc = documentFor(id); return { ...doc, name: title(doc), dirty: dirty(doc), drafts: drafts() }; }
function publish(id: string): void {
  const doc = documentFor(id);
  persist();
  // The host refuses closing a dirty tab/window. Recovery also survives forced close.
  void app.tabs.set(id, { title: title(doc), dirty: dirty(doc), restore: { draftId: doc.id } }).catch((error: Error) => {
    app.ui.post({ type: 'error', message: `The unsaved mark could not be updated. Your draft is kept. ${error.message}` }, id);
  });
  app.ui.post({ type: 'document', ...state(id) }, id);
}
function canReplace(id: string): void {
  if (busy.has(id)) fail('busy', 'Wait for the current file operation to finish.');
  if (dirty(documentFor(id))) fail('unsaved', 'Save or discard your edits before opening another document.');
}
async function run(argv: string[], stdin?: string): Promise<string> {
  const result = await app.exec(argv, stdin === undefined ? {} : { stdin });
  if (result.code !== 0) fail('file_error', result.stderr.trim().split('\n')[0] || `${argv[0]} could not complete. Check the file path and permissions.`);
  return result.stdout;
}
async function read(path: string): Promise<string> {
  return checkedText(await run(['head', '-c', String(MAX_BYTES + 1), path]));
}
function update(id: string, args: { id: string; text: string; revision: number }): unknown {
  const doc = documentFor(id);
  if (args.id !== doc.id) fail('stale_document', 'This edit belongs to another document. Recover its draft before continuing.');
  if (!Number.isSafeInteger(args.revision) || args.revision <= doc.revision) return state(id);
  doc.text = checkedText(args.text, 800_000);
  doc.revision = args.revision;
  publish(id);
  return state(id);
}
app.define({
  commands: {
    state(args: { windowId?: string } = {}, ctx) { return state(target(args, ctx)); },
    edit(args: { windowId?: string; id: string; text: string; revision: number }, ctx) { return update(target(args, ctx), args); },
    async open(args: { windowId?: string; path: string }, ctx) {
      const id = target(args, ctx);
      canReplace(id);
      const before = documentFor(id);
      const revision = before.revision;
      busy.add(id);
      try {
        const path = filePath(args.path);
        const text = await read(path);
        if (before.revision !== revision) fail('unsaved', 'Edits arrived while opening. Save or discard them, then open again.');
        const doc = createDocument();
        Object.assign(doc, { path, text, savedText: text });
        if (!dirty(before)) delete svgStore.documents[before.id];
        svgStore.windows[id] = doc.id;
        publish(id);
        return state(id);
      } finally { busy.delete(id); }
    },
    newDocument(args: { windowId?: string } = {}, ctx) {
      const id = target(args, ctx);
      canReplace(id);
      delete svgStore.documents[documentFor(id).id];
      svgStore.windows[id] = createDocument().id;
      publish(id);
      return state(id);
    },
    discard(args: { windowId?: string } = {}, ctx) {
      const id = target(args, ctx);
      if (busy.has(id)) fail('busy', 'Wait for the file operation to finish.');
      const doc = documentFor(id);
      doc.text = doc.savedText;
      doc.revision++;
      publish(id);
      return state(id);
    },
    recover(args: { windowId?: string; id: string }, ctx) {
      const id = target(args, ctx);
      canReplace(id);
      if (!svgStore.documents[args.id]) fail('not_found', 'That draft is no longer available.');
      if (Object.entries(svgStore.windows).some(([w, d]) => w !== id && active.has(w) && d === args.id)) fail('busy', 'That draft is already open in another tab.');
      const old = documentFor(id);
      svgStore.windows[id] = args.id;
      if (old.id !== args.id && !dirty(old)) delete svgStore.documents[old.id];
      publish(id);
      return state(id);
    },
    async save(args: { windowId?: string; path?: string } = {}, ctx) {
      const id = target(args, ctx);
      if (busy.has(id)) fail('busy', 'A file operation is already running.');
      const doc = documentFor(id);
      const path = args.path ? filePath(args.path) : doc.path;
      if (!path) fail('invalid_args', 'Choose a path with Save as first.');
      const same = !args.path && path === doc.path;
      const snapshot = checkedText(doc.text);
      busy.add(id);
      let temp = '';
      try {
        if (same && await read(path) !== doc.savedText) fail('conflict', 'The file changed on disk. Use Save as to keep your edits in a new file, then reopen the original.');
        const dir = path.slice(0, path.lastIndexOf('/')) || '.';
        temp = (await run(['mktemp', `${dir}/.svg-editor-XXXXXXXX`])).trim();
        if (!temp.startsWith(`${dir}/.svg-editor-`) || /[\r\n\0]/.test(temp)) fail('file_error', 'Could not create a temporary SVG file.');
        await run(['tee', temp], snapshot);
        if (await read(temp) !== snapshot) fail('file_error', 'The temporary file did not match your source. Your draft is kept; try Save as.');
        // Recheck after staging; edits arriving during IO remain dirty against snapshot.
        if (same && await read(path) !== doc.savedText) fail('conflict', 'The file changed while saving. Your edits are kept; use Save as.');
        await run(['mv', same ? '-f' : '-n', temp, path]);
        const stillThere = await app.exec(['head', '-c', '1', temp]);
        if (stillThere.code === 0) fail('exists', 'That file already exists. Choose a different name; nothing was overwritten.');
        // mv treats a directory destination specially. Never report it as a saved SVG.
        const destination = await app.exec(['head', '-c', String(MAX_BYTES + 1), path]);
        if (destination.code !== 0 || destination.stdout !== snapshot) {
          const nested = `${path}/${temp.slice(temp.lastIndexOf('/') + 1)}`;
          const movedIntoDirectory = await app.exec(['head', '-c', '1', nested]);
          if (movedIntoDirectory.code === 0) temp = nested;
          fail('file_error', 'The destination is not a readable SVG file. Choose another filename with Save as. Your draft is kept.');
        }
        temp = '';
        doc.path = path;
        doc.savedText = snapshot;
        publish(id);
        return state(id);
      } finally {
        if (temp) await app.exec(['rm', '-f', temp]);
        busy.delete(id);
      }
    },
  },
  onOpen({ windowId, params }) {
    const draftId = (params as any)?.draftId;
    const existing = svgStore.windows[windowId];
    const candidate = svgStore.documents[draftId] ?? svgStore.documents[existing];
    const inUse = candidate && Object.entries(svgStore.windows).some(([w, d]) => w !== windowId && active.has(w) && d === candidate.id);
    svgStore.windows[windowId] = candidate && !inUse ? candidate.id : createDocument().id;
    active.add(windowId);
    publish(windowId);
  },
  onMessage({ payload, windowId }) {
    if (!windowId || !svgStore.windows[windowId]) return;
    if (payload?.type === '__ui_ready') publish(windowId);
  },
  onClose({ windowId }) {
    const doc = documentFor(windowId);
    active.delete(windowId);
    delete svgStore.windows[windowId];
    if (doc && !dirty(doc)) delete svgStore.documents[doc.id];
    persist();
  },
});
