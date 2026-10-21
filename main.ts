// Classic script; the isolate owns documents and durable recovery, not the page.
interface SvgDocument {
  id: string;
  path: string;
  text: string;
  savedText: string;
  revision: number;
  undo?: string[];
  redo?: string[];
}
interface SvgStore {
  documents: Record<string, SvgDocument>;
  windows: Record<string, string>;
}
const MAX_BYTES = 200_000;
const STARTER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">\n</svg>\n';
const kept = app.store.get();
const svgStore: SvgStore = kept?.documents && kept?.windows ? { documents: kept.documents, windows: kept.windows } : { documents: {}, windows: {} };
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
function documentState(doc: SvgDocument) { const { undo, redo, ...publicDoc } = doc; return { ...publicDoc, canUndo: !!undo?.length, canRedo: !!redo?.length, scene: scene(doc.text), name: title(doc), dirty: dirty(doc), drafts: drafts() }; }
function state(id: string) { return documentState(documentFor(id)); }
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
// Native tabs own their strip, names, dirty guard and restore state, as in Markdown.
// Read before opening, so an invalid file never replaces an existing draft.
async function openTab(args: { windowId?: string; path?: string }, ctx: CommandCtx) {
  const current = target(args, ctx);
  const tabs = await app.tabs.list();
  const hostId = tabs.find(tab => tab.id === current)?.hostId ?? ctx.hostId ?? current;
  const path = args.path === undefined ? '' : filePath(args.path);
  const text = path ? await read(path) : STARTER;
  const doc = createDocument();
  Object.assign(doc, { path, text, savedText: text });
  persist();
  try {
    const opened = await app.tabs.open({ hostId, params: { draftId: doc.id } });
    return { ...documentState(doc), windowId: opened.windowId, hostId: opened.hostId };
  } catch (error) {
    if (!Object.values(svgStore.windows).includes(doc.id)) { delete svgStore.documents[doc.id]; persist(); }
    throw error;
  }
}
function update(id: string, args: { id: string; text: string; revision: number; expectedRevision: number }): unknown {
  const doc = documentFor(id);
  if (args.id !== doc.id) fail('stale_document', 'This edit belongs to another document. Recover its draft before continuing.');
  if (args.expectedRevision !== doc.revision || args.revision !== doc.revision + 1) {
    const conflictId = `conflict-${doc.id}-${id}`;
    svgStore.documents[conflictId] = { id: conflictId, path: doc.path, text: checkedText(args.text, 800_000), savedText: doc.savedText, revision: 0 };
    persist();
    fail('invalid_args', 'The shared document changed. Your source is kept in Drafts; read state before replacing source.');
  }
  const text = checkedText(args.text, 800_000);
  if (text !== doc.text) historyPush(doc);
  doc.text = text;
  doc.revision = args.revision;
  publish(id);
  return state(id);
}
// Source-preserving XML model. This never evaluates markup or inserts it in a DOM.
interface SvgNode {
  tag: string; attributes: Record<string, string>; start: number; openEnd: number;
  closeStart: number; end: number; children: SvgNode[]; parent: SvgNode | null; key: string;
}
function xmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail('invalid_args', 'Invalid XML character reference.');
      return String.fromCodePoint(code);
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity];
  });
}
function escaped(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function parseSvg(source: string): SvgNode {
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) fail('invalid_args', 'Remove DTD/entity declarations before visual editing.');
  const roots: SvgNode[] = [], stack: SvgNode[] = [];
  let pos = 0;
  while (pos < source.length) {
    if (source[pos] !== '<') {
      const end = source.indexOf('<', pos), stop = end < 0 ? source.length : end;
      const text = source.slice(pos, stop);
      if ((!stack.length && text.trim().replace(/^\uFEFF/, '')) || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(text)) fail('invalid_args', 'Fix the SVG XML before visual editing.');
      pos = stop; continue;
    }
    if (source.startsWith('<!--', pos) || source.startsWith('<?', pos) || source.startsWith('<![CDATA[', pos)) {
      const marker = source.startsWith('<!--', pos) ? '-->' : source.startsWith('<?', pos) ? '?>' : ']]>';
      const end = source.indexOf(marker, pos + 2);
      if (end < 0) fail('invalid_args', 'Unclosed XML comment, instruction or CDATA.');
      pos = end + marker.length; continue;
    }
    let end = pos + 1, quote = '';
    for (; end < source.length; end++) {
      const ch = source[end];
      if (quote) { if (ch === quote) quote = ''; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
    }
    if (end >= source.length) fail('invalid_args', 'Unclosed SVG tag.');
    const token = source.slice(pos, end + 1);
    if (token.startsWith('</')) {
      const name = token.match(/^<\/([\w:.-]+)\s*>$/)?.[1];
      const node = stack.pop();
      if (!node || node.tag !== name) fail('invalid_args', 'SVG closing tags do not match.');
      node.closeStart = pos; node.end = end + 1;
    } else {
      const match = token.match(/^<([A-Za-z_][\w:.-]*)/);
      if (!match) fail('invalid_args', 'Unsupported SVG XML markup.');
      const tag = match[1], attributes: Record<string, string> = Object.create(null);
      let rest = token.slice(match[0].length).replace(/\/?\s*>$/, '');
      while (rest.trim()) {
        const attr = rest.match(/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/);
        if (!attr || Object.hasOwn(attributes, attr[1]) || /</.test(attr[3]) || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(attr[3])) fail('invalid_args', 'Fix duplicate or malformed SVG attributes before visual editing.');
        attributes[attr[1]] = xmlText(attr[3]); rest = rest.slice(attr[0].length);
      }
      const parent = stack[stack.length - 1] ?? null;
      const siblings = parent ? parent.children : roots;
      const node: SvgNode = { tag, attributes, start: pos, openEnd: end + 1, closeStart: end + 1, end: end + 1, children: [], parent, key: `${parent?.key ?? 'n'}:${siblings.length}` };
      siblings.push(node);
      if (!/\/\s*>$/.test(token)) stack.push(node);
    }
    pos = end + 1;
  }
  if (stack.length || roots.length !== 1 || roots[0].tag !== 'svg' || roots[0].attributes.xmlns !== 'http://www.w3.org/2000/svg') fail('invalid_args', 'Use one SVG root with the SVG namespace before visual editing.');
  const counts = new Map<string, number>();
  const walk = (node: SvgNode, fn: (node: SvgNode) => void) => { fn(node); node.children.forEach(child => walk(child, fn)); };
  walk(roots[0], node => { const id = node.attributes.id; if (id) counts.set(id, (counts.get(id) ?? 0) + 1); });
  walk(roots[0], node => { const id = node.attributes.id; if (id && counts.get(id) === 1) node.key = `id:${id}`; });
  return roots[0];
}
function allNodes(root: SvgNode): SvgNode[] { return [root, ...root.children.flatMap(allNodes)]; }
const DRAWABLE = new Set(['rect', 'ellipse', 'circle', 'line', 'text', 'path', 'polygon', 'polyline']);
function isDrawable(node: SvgNode): boolean {
  if (!DRAWABLE.has(node.tag)) return false;
  for (let p = node.parent; p; p = p.parent) if (!['svg', 'g', 'a'].includes(p.tag)) return false;
  return true;
}
function presentation(node: SvgNode, rules: { selector: string; values: Record<string, string>; weight: number }[]): Record<string, string> {
  const properties = new Set(['fill','stroke','stroke-width','font-size','font-family','font-weight','text-anchor','visibility','display']);
  const chain: SvgNode[] = []; for (let p: SvgNode | null = node; p; p = p.parent) chain.unshift(p);
  const result: Record<string, string> = {};
  const matches = (selector: string, n: SvgNode) => {
    if (/^\.[\w-]+$/.test(selector)) return (n.attributes.class ?? '').split(/\s+/).includes(selector.slice(1));
    if (/^#[\w-]+$/.test(selector)) return n.attributes.id === selector.slice(1);
    return selector === n.tag;
  };
  for (const current of chain) {
    for (const [key,value] of Object.entries(current.attributes)) if (properties.has(key)) result[key] = value;
    for (const rule of rules) if (matches(rule.selector, current)) Object.assign(result, rule.values);
    for (const part of (current.attributes.style ?? '').split(';')) { const at = part.indexOf(':'); const key = part.slice(0,at).trim(); if (at >= 0 && properties.has(key)) result[key] = part.slice(at+1).trim(); }
  }
  return result;
}
function scene(source: string) {
  try {
    const root = parseSvg(source);
    const rules: { selector: string; values: Record<string, string>; weight: number }[] = [];
    for (const node of allNodes(root).filter(n => n.tag === 'style')) {
      for (const match of source.slice(node.openEnd,node.closeStart).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const values: Record<string,string> = {};
        for (const part of match[2].split(';')) { const at=part.indexOf(':'); if (at>0) values[part.slice(0,at).trim()]=part.slice(at+1).trim(); }
        for (const selector of match[1].split(',').map(s=>s.trim())) rules.push({selector,values,weight:selector.startsWith('#')?100:selector.startsWith('.')?10:1});
      }
    }
    rules.sort((a,b)=>a.weight-b.weight);
    const objects = allNodes(root).filter(isDrawable).map(node => ({
      key: node.key, type: node.tag, attributes: { ...node.attributes }, presentation: presentation(node,rules),
      text: node.tag === 'text' ? xmlText(source.slice(node.openEnd, node.closeStart).replace(/<[^>]*>/g, '')) : '',
      transforms: (() => { const list: string[] = []; for (let p: SvgNode | null = node; p; p = p.parent) list.unshift(p.attributes.transform ?? ''); return list; })(),
    }));
    const raw = (root.attributes.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
    const viewBox = raw.length === 4 && raw.every(Number.isFinite) && raw[2] > 0 && raw[3] > 0 ? raw : [0, 0, parseFloat(root.attributes.width) || 800, parseFloat(root.attributes.height) || 500];
    return { objects, viewBox, error: '' };
  } catch (error) { return { objects: [], viewBox: [0, 0, 800, 500], error: (error as Error).message }; }
}
function openTag(node: SvgNode): string {
  return `<${node.tag}${Object.entries(node.attributes).map(([key, value]) => ` ${key}="${escaped(String(value))}"`).join('')}${node.end === node.openEnd ? '/>' : '>'}`;
}
function replaceNodeTag(source: string, node: SvgNode): string { return source.slice(0, node.start) + openTag(node) + source.slice(node.openEnd); }
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000) fail('invalid_args', `${name} must be a finite coordinate between -1000000 and 1000000.`);
  return Math.round(value * 1000) / 1000;
}
const NUMERIC_ATTRS = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'width', 'height', 'rx', 'ry', 'r', 'stroke-width', 'font-size', 'opacity']);
function validProperty(property: string, value: string): string {
  if (NUMERIC_ATTRS.has(property)) {
    const n = finite(Number(value), property);
    if (['width', 'height', 'rx', 'ry', 'r', 'stroke-width', 'font-size'].includes(property) && n < 0) fail('invalid_args', `${property} cannot be negative.`);
    if (property === 'opacity' && (n < 0 || n > 1)) fail('invalid_args', 'Opacity must be between zero and one.');
    return String(n);
  }
  if (['fill', 'stroke'].includes(property) && /^(?:none|[a-z]{1,24}|#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d.,%\s+-]+\)|url\(#[\w.-]+\))$/i.test(value)) return value;
  if (property === 'text-anchor' && ['start', 'middle', 'end'].includes(value)) return value;
  fail('invalid_args', `Unsupported property: ${property}. Use numeric geometry, fill, stroke, opacity, font-size or text.`);
}
function historyPush(doc: SvgDocument): void {
  const history = [...(doc.undo ?? []), doc.text].slice(-30);
  while (history.length > 1 && history.reduce((n, t) => n + bytes(t), 0) > 1_000_000) history.shift();
  doc.undo = history; doc.redo = [];
}
function commitSource(id: string, text: string): void {
  const doc = documentFor(id);
  checkedText(text);
  if (text === doc.text) return;
  historyPush(doc); doc.text = text; doc.revision++; publish(id);
}
function visualTarget(args: { windowId?: string; documentId: string; expectedRevision: number }, ctx?: CommandCtx) {
  const id = target(args, ctx), doc = documentFor(id);
  if (args.documentId !== doc.id || args.expectedRevision !== doc.revision) fail('invalid_args', 'The document changed. Read objects/state and retry against its current revision.');
  return { id, doc, root: parseSvg(doc.text) };
}
function findObject(root: SvgNode, key: string): SvgNode {
  const node = allNodes(root).find(n => n.key === key && isDrawable(n));
  if (!node) fail('not_found', 'That object no longer exists. Read objects and select again.');
  return node;
}

app.define({
  commands: {
    objects(args: { windowId?: string } = {}, ctx) { const id = target(args, ctx), doc = documentFor(id); return { documentId: doc.id, revision: doc.revision, ...scene(doc.text) }; },
    add(args: { windowId?: string; documentId: string; expectedRevision: number; type: string; x: number; y: number; width?: number; height?: number; text?: string; fill?: string; stroke?: string; strokeWidth?: number; fontSize?: number }, ctx) {
      const { id, doc, root } = visualTarget(args, ctx);
      if (!['rect', 'ellipse', 'line', 'text'].includes(args.type)) fail('invalid_args', 'Choose rect, ellipse, line or text.');
      const x = finite(args.x, 'x'), y = finite(args.y, 'y'), width = finite(args.width ?? 120, 'width'), height = finite(args.height ?? 80, 'height');
      if (args.type !== 'line' && (width <= 0 || height <= 0)) fail('invalid_args', 'Shape width and height must be positive.');
      let sequence = 1; const ids = new Set(allNodes(root).map(n => n.attributes.id));
      while (ids.has(`shape-${sequence}`)) sequence++;
      const attrs: Record<string, string> = { id: `shape-${sequence}`, fill: validProperty('fill', args.fill ?? (args.type === 'text' ? '#1f2937' : 'none')), stroke: validProperty('stroke', args.stroke ?? (args.type === 'text' ? 'none' : '#475569')), 'stroke-width': validProperty('stroke-width', String(args.strokeWidth ?? 2)) };
      if (args.type === 'rect') Object.assign(attrs, { x, y, width, height });
      if (args.type === 'ellipse') Object.assign(attrs, { cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 });
      if (args.type === 'line') Object.assign(attrs, { x1: x, y1: y, x2: x + width, y2: y + height });
      if (args.type === 'text') Object.assign(attrs, { x, y, 'font-size': validProperty('font-size', String(args.fontSize ?? 24)), 'font-family': 'system-ui' });
      const attrText = Object.entries(attrs).map(([key, value]) => ` ${key}="${escaped(String(value))}"`).join('');
      const markup = args.type === 'text' ? `<text${attrText}>${escaped(String(args.text ?? 'Text'))}</text>` : `<${args.type}${attrText}/>`;
      const at = root.closeStart;
      const prefix = doc.text.slice(0, at), suffix = doc.text.slice(at);
      const expanded = root.end === root.openEnd ? doc.text.slice(0, root.start) + openTag({ ...root, end: root.openEnd + 1 }) + '\n  ' + markup + '\n</svg>' + doc.text.slice(root.end) : prefix + '  ' + markup + '\n' + suffix;
      commitSource(id, expanded);
      return { ...state(id), selectedKey: `id:${attrs.id}` };
    },
    set(args: { windowId?: string; documentId: string; expectedRevision: number; key: string; property: string; value: string }, ctx) {
      const { id, doc, root } = visualTarget(args, ctx), node = findObject(root, args.key);
      if (args.property === 'text') {
        if (node.tag !== 'text') fail('invalid_args', 'Only text objects have editable labels.');
        const content = escaped(String(args.value));
        if (node.end === node.openEnd) commitSource(id, doc.text.slice(0, node.start) + openTag({ ...node, end: node.openEnd + 1 }) + content + '</text>' + doc.text.slice(node.end));
        else commitSource(id, doc.text.slice(0, node.openEnd) + content + doc.text.slice(node.closeStart));
      } else {
        node.attributes[args.property] = validProperty(args.property, args.value);
        // Inline presentation overrides inherited/class CSS for intentional visual edits.
        if (['fill', 'stroke', 'stroke-width', 'font-size', 'opacity'].includes(args.property)) {
          const style = (node.attributes.style ?? '').split(';').filter(s => s.trim() && s.split(':')[0].trim() !== args.property);
          style.push(`${args.property}:${node.attributes[args.property]}`); node.attributes.style = style.join(';');
        }
        commitSource(id, replaceNodeTag(doc.text, node));
      }
      return state(id);
    },
    move(args: { windowId?: string; documentId: string; expectedRevision: number; key: string; dx: number; dy: number }, ctx) {
      const { id, doc, root } = visualTarget(args, ctx), node = findObject(root, args.key);
      const dx = finite(args.dx, 'dx'), dy = finite(args.dy, 'dy');
      node.attributes.transform = `translate(${dx} ${dy}) ${node.attributes.transform ?? ''}`.trim();
      commitSource(id, replaceNodeTag(doc.text, node)); return state(id);
    },
    resize(args: { windowId?: string; documentId: string; expectedRevision: number; key: string; x: number; y: number; width: number; height: number }, ctx) {
      const { id, doc, root } = visualTarget(args, ctx), node = findObject(root, args.key);
      const x = finite(args.x, 'x'), y = finite(args.y, 'y'), width = finite(args.width, 'width'), height = finite(args.height, 'height');
      if (!['rect', 'ellipse', 'circle', 'line'].includes(node.tag)) fail('invalid_args', 'Resize boxes, ellipses, circles or lines. Move other objects or edit their source.');
      if (node.tag !== 'line' && (width <= 0 || height <= 0)) fail('invalid_args', 'Width and height must be positive.');
      if (node.tag === 'rect') Object.assign(node.attributes, { x, y, width, height });
      if (node.tag === 'ellipse') Object.assign(node.attributes, { cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 });
      if (node.tag === 'circle') Object.assign(node.attributes, { cx: x + width / 2, cy: y + height / 2, r: Math.min(width, height) / 2 });
      if (node.tag === 'line') Object.assign(node.attributes, { x1: x, y1: y, x2: x + width, y2: y + height });
      commitSource(id, replaceNodeTag(doc.text, node)); return state(id);
    },
    remove(args: { windowId?: string; documentId: string; expectedRevision: number; key: string }, ctx) {
      const { id, doc, root } = visualTarget(args, ctx), node = findObject(root, args.key);
      commitSource(id, doc.text.slice(0, node.start) + doc.text.slice(node.end)); return state(id);
    },
    undo(args: { windowId?: string; documentId: string; expectedRevision: number }, ctx) {
      const id = target(args, ctx), doc = documentFor(id);
      if (args.documentId !== doc.id || args.expectedRevision !== doc.revision) fail('invalid_args', 'The document changed. Read state before undoing.');
      if (doc.undo?.length) { doc.redo = [...(doc.redo ?? []), doc.text]; doc.text = doc.undo.pop()!; doc.revision++; publish(id); }
      return state(id);
    },
    redo(args: { windowId?: string; documentId: string; expectedRevision: number }, ctx) {
      const id = target(args, ctx), doc = documentFor(id);
      if (args.documentId !== doc.id || args.expectedRevision !== doc.revision) fail('invalid_args', 'The document changed. Read state before redoing.');
      if (doc.redo?.length) { doc.undo = [...(doc.undo ?? []), doc.text]; doc.text = doc.redo.pop()!; doc.revision++; publish(id); }
      return state(id);
    },

    state(args: { windowId?: string } = {}, ctx) { return state(target(args, ctx)); },
    edit(args: { windowId?: string; id: string; text: string; revision: number; expectedRevision: number }, ctx) { return update(target(args, ctx), args); },
    tabs() { return app.tabs.list(); },
    newTab(args: { windowId?: string; path?: string } = {}, ctx) { return openTab(args, ctx); },
    async open(args: { windowId?: string; path: string; newTab?: boolean }, ctx) {
      if (args.newTab) return openTab(args, ctx);
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
    if (payload?.type === '__source_conflict' && typeof payload.documentId === 'string') {
      const doc = svgStore.documents[payload.documentId], conflictId = `conflict-${payload.documentId}-${windowId}`;
      svgStore.documents[conflictId] = { id: conflictId, path: doc?.path ?? '', text: checkedText(payload.text, 800_000), savedText: doc?.savedText ?? '', revision: 0 };
      persist();
    }
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
