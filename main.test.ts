function eq(actual: unknown, expected: unknown, note = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${note}\nactual ${JSON.stringify(actual)}\nexpected ${JSON.stringify(expected)}`);
}
function ok(value: unknown, note = 'Expected truthy') { if (!value) throw new Error(note); }
async function rejects(action: () => unknown, code: string) {
  try { await action(); } catch (error) { eq((error as any).code, code); return; }
  throw new Error(`Expected ${code}`);
}
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><text>Service</text></svg>\n';
async function harness(saved?: any) {
  const h = { spec: null as any, files: new Map<string, string>(), directories: new Set<string>(), posts: [] as any[], labels: new Map<string, any>(), calls: [] as any[], tabRows: [] as any[], tabOpens: [] as any[], tabError: false, stored: saved, seq: 0, failWrite: false, beforeMove: null as null | (() => void), gate: null as null | (() => Promise<void>) };
  (globalThis as any).workspace = { sources: [{ primary: true, path: '/workspace' }] };
  (globalThis as any).app = {
    define(spec: any) { h.spec = spec; },
    ui: { post(payload: any, windowId: string) { h.posts.push({ payload, windowId }); } },
    tabs: {
      set(id: string, fields: any) { h.labels.set(id, fields); return Promise.resolve({ ok: true }); },
      list() { return Promise.resolve(h.tabRows); },
      async open(opts: any) {
        if (h.tabError) throw Object.assign(new Error('Tab limit'), { code: 'limit' });
        const windowId = `tab-${h.tabOpens.length + 1}`;
        h.tabOpens.push(opts); h.tabRows.push({ id: windowId, hostId: opts.hostId });
        await h.spec.onOpen({ windowId, hostId: opts.hostId, params: opts.params, reason: 'script' });
        return { windowId, hostId: opts.hostId };
      },
    },
    store: { get() { return h.stored; }, set(value: any) { h.stored = structuredClone(value); } },
    async exec(argv: string[], opts: any = {}) {
      h.calls.push({ argv, ...opts });
      const [bin, a, b, c] = argv;
      const result = (code: number, stdout = '', stderr = '') => ({ code, stdout, stderr });
      if (bin === 'head') {
        if (h.gate) { const gate = h.gate; h.gate = null; await gate(); }
        return h.files.has(c) ? result(0, h.files.get(c)!.slice(0, +b)) : result(1, '', 'No such file');
      }
      if (bin === 'mktemp') { const path = a.replace('XXXXXXXX', `tmp${++h.seq}`); h.files.set(path, ''); return result(0, `${path}\n`); }
      if (bin === 'tee') { if (h.failWrite) return result(1, '', 'Disk full'); h.files.set(a, opts.stdin); return result(0, opts.stdin); }
      if (bin === 'mv') {
        if (h.beforeMove) { h.beforeMove(); h.beforeMove = null; }
        if (a === '-n' && h.files.has(c)) return result(0);
        h.files.set(h.directories.has(c) ? `${c}/${b.split('/').pop()}` : c, h.files.get(b)!); h.files.delete(b); return result(0);
      }
      if (bin === 'rm') { h.files.delete(b); return result(0); }
      throw new Error(`Unexpected exec ${argv}`);
    },
  };
  await import(`./main.ts#${crypto.randomUUID()}`);
  const ctx = (windowId = 'w1') => ({ windowId, hostId: windowId, caller: 'test' });
  const command = (name: string, args: any = {}, windowId = 'w1') => h.spec.commands[name](args, ctx(windowId));
  const open = (windowId = 'w1', params = {}) => h.spec.onOpen({ windowId, params });
  const edit = (text: string, windowId = 'w1') => { const s = command('state', {}, windowId); return command('edit', { id: s.id, text, revision: s.revision + 1, expectedRevision: s.revision }, windowId); };
  return Object.assign(h, { command, open, edit });
}
Deno.test('open, edit Unicode, atomic save and reopen preserve exact SVG source', async () => {
  const h = await harness(); h.open(); h.files.set('/workspace/diagram.svg', SVG);
  await h.command('open', { path: 'diagram.svg' });
  const edited = SVG.replace('Service', 'Mémoire → 🦊'); h.edit(edited);
  eq(h.command('state').dirty, true); eq(h.labels.get('w1').dirty, true);
  await rejects(() => h.command('save', { path: 'diagram.svg' }), 'exists');
  await h.command('save'); eq(h.files.get('/workspace/diagram.svg'), edited); eq(h.command('state').dirty, false);
  await h.command('open', { path: 'diagram.svg' }); eq(h.command('state').text, edited);
  ok(h.calls.some(c => c.argv[0] === 'tee' && c.stdin === edited));
  ok(![...h.files.keys()].some(p => p.includes('.svg-editor-')));
});
Deno.test('save as never overwrites an existing file, including creation during save', async () => {
  const h = await harness(); h.open(); h.edit(SVG);
  h.files.set('/workspace/exists.svg', 'original');
  await rejects(() => h.command('save', { path: 'exists.svg' }), 'exists');
  eq(h.files.get('/workspace/exists.svg'), 'original'); eq(h.command('state').dirty, true);
  h.beforeMove = () => h.files.set('/workspace/race.svg', 'new external file');
  await rejects(() => h.command('save', { path: 'race.svg' }), 'exists'); eq(h.files.get('/workspace/race.svg'), 'new external file');
  await h.command('save', { path: 'copy.svg' }); eq(h.command('state').path, '/workspace/copy.svg'); eq(h.files.get('/workspace/copy.svg'), SVG);
});
Deno.test('disk conflicts and write failures preserve both original and dirty draft', async () => {
  const h = await harness(); h.open(); h.files.set('/workspace/a.svg', SVG); await h.command('open', { path: 'a.svg' }); h.edit(SVG + '<!-- edit -->');
  h.files.set('/workspace/a.svg', 'external'); await rejects(() => h.command('save'), 'conflict'); eq(h.files.get('/workspace/a.svg'), 'external');
  h.files.set('/workspace/a.svg', SVG); h.failWrite = true; await rejects(() => h.command('save'), 'file_error'); eq(h.files.get('/workspace/a.svg'), SVG);
  eq(h.command('state').dirty, true); ok(![...h.files.keys()].some(p => p.includes('.svg-editor-')));
});
Deno.test('unsaved guard, explicit discard, stale edits and separate windows', async () => {
  const h = await harness(); h.open(); h.open('w2'); const a = h.command('state'); h.edit('invalid SVG');
  await rejects(() => h.command('open', { path: 'a.svg' }), 'unsaved'); await rejects(() => h.command('newDocument'), 'unsaved');
  eq(h.command('state', {}, 'w2').dirty, false); eq(h.command('state').text, 'invalid SVG');
  await rejects(() => h.command('edit', { id: a.id, text: 'late', revision: 0, expectedRevision: 0 }), 'invalid_args'); eq(h.command('state').text, 'invalid SVG');
  await rejects(() => h.command('edit', { id: 'wrong', text: SVG, revision: 4 }), 'stale_document');
  h.command('discard'); eq(h.command('state').text, a.text); eq(h.command('state').dirty, false);
});
Deno.test('closed dirty drafts and restart recovery retain invalid source', async () => {
  const h = await harness(); h.open(); h.edit('<svg broken'); const draft = h.command('state');
  h.spec.onClose({ windowId: 'w1' }); h.open('w2'); h.command('recover', { id: draft.id }, 'w2'); eq(h.command('state', {}, 'w2').text, '<svg broken');
  const restarted = await harness(h.stored); restarted.open('new-window', { draftId: draft.id });
  eq(restarted.command('state', {}, 'new-window').text, '<svg broken'); eq(restarted.labels.get('new-window').dirty, true);
});
Deno.test('edits during save remain dirty; overlapping saves are refused', async () => {
  const h = await harness(); h.open(); h.files.set('/workspace/a.svg', SVG); await h.command('open', { path: 'a.svg' });
  h.edit(SVG + '<!-- first -->'); let release!: () => void;
  h.gate = () => new Promise<void>(resolve => { release = resolve; }); const saving = h.command('save');
  h.edit(SVG + '<!-- second -->'); await rejects(() => h.command('save'), 'busy'); release(); await saving;
  eq(h.files.get('/workspace/a.svg'), SVG + '<!-- first -->'); eq(h.command('state').text, SVG + '<!-- second -->'); eq(h.command('state').dirty, true);
});
Deno.test('editing during open cannot lose new source', async () => {
  const h = await harness(); h.open(); h.files.set('/workspace/a.svg', SVG); let release!: () => void;
  h.gate = () => new Promise<void>(resolve => { release = resolve; }); const opening = h.command('open', { path: 'a.svg' });
  h.edit('new unsaved source'); release(); await rejects(() => opening, 'unsaved'); eq(h.command('state').text, 'new unsaved source');
});
Deno.test('invalid paths and oversized files do not replace document; large Unicode drafts stay recoverable', async () => {
  const h = await harness(); h.open(); const original = h.command('state').text;
  for (const path of ['a.png', '', 'bad\n.svg']) await rejects(() => h.command('open', { path }), 'invalid_args');
  h.files.set('/workspace/big.svg', 'x'.repeat(200001)); await rejects(() => h.command('open', { path: 'big.svg' }), 'invalid_args'); eq(h.command('state').text, original);
  h.edit('🦊'.repeat(60000)); eq(h.command('state').dirty, true); await rejects(() => h.command('save', { path: 'large.svg' }), 'invalid_args');
});

Deno.test('a directory ending in .svg cannot be mistaken for a saved file', async () => {
  const h = await harness(); h.open(); h.edit(SVG); h.directories.add('/workspace/folder.svg');
  await rejects(() => h.command('save', { path: 'folder.svg' }), 'file_error');
  eq(h.command('state').dirty, true); eq(h.command('state').path, '');
  ok(![...h.files.keys()].some(p => p.includes('.svg-editor-')));
});
function stamped(h: any) { const s = h.command('state'); return { documentId: s.id, expectedRevision: s.revision }; }
Deno.test('structured agents and human actions share objects, source, revisions and history', async () => {
  const h = await harness(); h.open();
  const added = h.command('add', { ...stamped(h), type: 'rect', x: 10, y: 20, width: 120, height: 80 });
  eq(added.selectedKey, 'id:shape-1');
  const objects = h.command('objects'); eq(objects.objects.length, 1); eq(objects.objects[0].attributes.x, '10');
  eq(objects.revision, h.command('state').revision);
  h.command('move', { ...stamped(h), key: added.selectedKey, dx: 40, dy: -10 });
  eq(h.command('objects').objects[0].attributes.transform, 'translate(40 -10)');
  h.command('resize', { ...stamped(h), key: added.selectedKey, x: 10, y: 20, width: 200, height: 100 });
  eq(h.command('objects').objects[0].attributes.width, '200');
  h.command('set', { ...stamped(h), key: added.selectedKey, property: 'fill', value: '#f0f0f0' });
  ok(h.command('state').text.includes('fill:#f0f0f0'));
  const final = h.command('state').text;
  h.command('undo', stamped(h)); ok(!h.command('state').text.includes('fill:#f0f0f0'));
  h.command('redo', stamped(h)); eq(h.command('state').text, final);
  h.command('remove', { ...stamped(h), key: added.selectedKey }); eq(h.command('objects').objects.length, 0);
  h.command('undo', stamped(h)); eq(h.command('objects').objects.length, 1); eq(h.labels.get('w1').dirty, true);
});
Deno.test('all drawing primitives and Unicode text save and reopen in the shared SVG', async () => {
  const h = await harness(); h.open();
  for (const type of ['rect', 'ellipse', 'line', 'text']) h.command('add', { ...stamped(h), type, x: 40, y: 60, width: 100, height: type === 'line' ? -30 : 70, text: 'Service → Mémoire 🦊 & <queue>' });
  const text = h.command('objects').objects.find((o: any) => o.type === 'text');
  eq(text.text, 'Service → Mémoire 🦊 & <queue>');
  h.command('set', { ...stamped(h), key: text.key, property: 'text', value: 'Updated <label> & "safe"' });
  eq(h.command('objects').objects.find((o: any) => o.key === text.key).text, 'Updated <label> & "safe"');
  const saved = h.command('state').text; ok(saved.includes('&lt;label&gt;'));
  await h.command('save', { path: 'drawn.svg' }); await h.command('open', { path: 'drawn.svg' });
  eq(h.command('state').text, saved); eq(h.command('objects').objects.length, 4);
});
Deno.test('revision checks reject stale visual mutations and preserve conflicting raw source as a draft', async () => {
  const h = await harness(); h.open(); const before = h.command('state'), stamp = stamped(h);
  h.command('add', { ...stamp, type: 'rect', x: 10, y: 10 }); const after = h.command('state').text;
  await rejects(() => h.command('add', { ...stamp, type: 'text', x: 10, y: 10 }), 'invalid_args');
  eq(h.command('state').text, after);
  await rejects(() => h.command('edit', { id: before.id, expectedRevision: before.revision, revision: before.revision + 1, text: '<svg broken local draft' }), 'invalid_args');
  eq(h.command('state').text, after); ok(h.stored.documents[`conflict-${before.id}-w1`].text.includes('broken local'));
});
Deno.test('visual edits preserve unedited SVG definitions, comments, styles and group transforms', async () => {
  const h = await harness(); h.open();
  const prefix = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">\n<!-- keep exact -->\n<defs><linearGradient id="paint"><stop stop-color="#fff"/></linearGradient></defs>\n<style>.label {font-size:20px;fill:blue}</style>\n';
  const original = prefix + '<g transform="translate(30 40)"><rect id="box" x="5" y="8" width="100" height="80" fill="url(#paint)"/><text class="label" x="10" y="20">Queue</text></g>\n</svg>';
  h.edit(original); const objects = h.command('objects'); eq(objects.objects.length, 2); eq(objects.objects[0].transforms, ['', 'translate(30 40)', '']);
  h.command('move', { ...stamped(h), key: 'id:box', dx: 10, dy: 20 }); ok(h.command('state').text.startsWith(prefix));
  const text = h.command('objects').objects.find((o: any) => o.type === 'text');
  h.command('set', { ...stamped(h), key: text.key, property: 'text', value: 'Worker' });
  ok(h.command('state').text.includes('<text class="label" x="10" y="20">Worker</text>')); ok(h.command('state').text.startsWith(prefix));
});
Deno.test('structured API refuses active markup, invalid geometry, unsafe properties and malformed XML', async () => {
  const h = await harness(); h.open(); h.command('add', { ...stamped(h), type: 'rect', x: 0, y: 0 });
  const key = h.command('objects').objects[0].key, before = h.command('state').text;
  for (const [property, value] of [['onload','alert(1)'],['href','javascript:alert(1)'],['fill','url(https://evil.test/x)'],['transform','rotate(1)'],['width','-5']]) {
    await rejects(() => h.command('set', { ...stamped(h), key, property, value }), 'invalid_args'); eq(h.command('state').text, before);
  }
  await rejects(() => h.command('add', { ...stamped(h), type: 'script', x: 0, y: 0 }), 'invalid_args');
  await rejects(() => h.command('move', { ...stamped(h), key, dx: Infinity, dy: 0 }), 'invalid_args');
  h.edit('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'); ok(h.command('objects').error);
  await rejects(() => h.command('add', { ...stamped(h), type: 'rect', x: 0, y: 0 }), 'invalid_args');
  h.edit('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>'); ok(h.command('objects').error);
});
Deno.test('self-closing roots/text, quoted greater-than and duplicate ids are handled without dropping markup', async () => {
  const h = await harness(); h.open(); h.edit('<svg xmlns="http://www.w3.org/2000/svg"/>');
  h.command('add', { ...stamped(h), type: 'text', x: 20, y: 20, text: 'A > B' }); eq(h.command('objects').objects[0].text, 'A > B');
  h.edit('<svg xmlns="http://www.w3.org/2000/svg"><text id="same" data-note="a > b"/><text id="same">Second</text></svg>');
  const objects = h.command('objects').objects; ok(objects[0].key !== objects[1].key);
  h.command('set', { ...stamped(h), key: objects[0].key, property: 'text', value: 'First' });
  eq(h.command('objects').objects.map((o: any) => o.text), ['First','Second']); ok(h.command('state').text.includes('data-note="a &gt; b"'));
});
Deno.test('a rejected source write stops later queued snapshots instead of colliding with an agent revision', async () => {
  await import(`./ui/source-sync.js#${crypto.randomUUID()}`);
  const sync = (globalThis as any).SvgSourceSync;
  let shared = 'original', revision = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), calls: number[] = [];
  const queue = sync.create(async (args: any) => {
    calls.push(args.expectedRevision); await gate;
    if (args.expectedRevision !== revision) throw new Error('stale');
    shared = args.text; revision++; return { text: shared, revision };
  });
  const first = queue.enqueue({ expectedRevision: 0, text: 'first human source' });
  const second = queue.enqueue({ expectedRevision: 1, text: 'second human source' });
  // An agent commits before the first source request reaches the shared document.
  shared = 'agent source'; revision = 1; release();
  await Promise.allSettled([first, second]);
  eq(calls, [0]); eq(shared, 'agent source'); eq(revision, 1); eq(queue.blocked, true);
  await Promise.allSettled([queue.enqueue({ expectedRevision: 1, text: 'more local input' })]); eq(calls, [0]);
  queue.reset(); await queue.enqueue({ expectedRevision: 1, text: 'explicitly reconciled source' });
  eq(shared, 'explicitly reconciled source'); eq(revision, 2);
});
Deno.test('source recovery requires matching ancestry, never just a higher cached revision', async () => {
  await import(`./ui/source-sync.js#${crypto.randomUUID()}`);
  const sync = (globalThis as any).SvgSourceSync;
  eq(sync.canReplay({ text: 'local', baseText: 'old', revision: 100 }, { text: 'new agent source', revision: 1 }), false);
  eq(sync.canReplay({ text: 'local', baseText: 'same base', revision: 2 }, { text: 'same base', revision: 1 }), true);
  eq(sync.canReplay({ text: 'legacy local', revision: 100 }, { text: 'shared', revision: 1 }), false);
});
Deno.test('paused source input can keep the latest conflicting text without mutating the shared document', async () => {
  const h = await harness(); h.open(); const before = h.command('state');
  h.command('add', { ...stamped(h), type: 'text', x: 20, y: 30, text: 'Agent' });
  const shared = h.command('state').text;
  h.spec.onMessage({ windowId: 'w1', payload: { type: '__source_conflict', documentId: before.id, text: 'latest local input, including queued characters' } });
  eq(h.command('state').text, shared);
  eq(h.stored.documents[`conflict-${before.id}-w1`].text, 'latest local input, including queued characters');
  h.command('discard'); h.command('newDocument');
  const replacement = h.command('state');
  h.spec.onMessage({ windowId: 'w1', payload: { type: '__source_conflict', documentId: before.id, text: 'last queued input from replaced document' } });
  eq(h.command('state').id, replacement.id); eq(h.command('state').text, replacement.text);
  eq(h.stored.documents[`conflict-${before.id}-w1`].text, 'last queued input from replaced document');
});

Deno.test('native tabs open files and blanks without replacing any existing unsaved document', async () => {
  const h = await harness(); h.open(); h.open('second');
  h.tabRows.push({ id: 'w1', hostId: 'host' }, { id: 'second', hostId: 'host' });
  h.edit(SVG.replace('Service', 'Architecture draft'));
  const second = h.edit(SVG.replace('Service', 'Untitled draft'), 'second');
  const first = h.command('state');
  const before = structuredClone(h.stored);
  h.files.set('/workspace/new.svg', SVG);
  const opened = await h.command('open', { windowId: 'second', path: 'new.svg', newTab: true });
  eq(h.tabOpens[0].hostId, 'host'); eq(opened.hostId, 'host');
  eq(h.command('state', {}, opened.windowId).text, SVG);
  eq(h.command('state'), first); eq(h.command('state', {}, 'second'), second);
  for (const id of [first.id, second.id]) eq(h.stored.documents[id], before.documents[id]);
  const blank = await h.command('newTab'); ok(blank.text.includes('viewBox')); eq(blank.path, '');
  eq(h.command('state', {}, blank.windowId).id, blank.id);
  eq((await h.command('tabs')).length, 4);
  await rejects(() => h.command('open', { path: 'missing.svg', newTab: true }), 'file_error');
  eq(h.tabOpens.length, 2);
  h.tabError = true; const count = Object.keys(h.stored.documents).length;
  await rejects(() => h.command('newTab'), 'limit');
  eq(Object.keys(h.stored.documents).length, count);
  eq(h.command('state'), first); eq(h.command('state', {}, 'second'), second);
});

Deno.test('SVG.js geometry preserves transform order, rotate centers and inverse movement', async () => {
  const library = await Deno.readTextFile(new URL('./ui/vendor/svgjs-3.2.8.min.js', import.meta.url));
  (globalThis as any).SVG = new Function(library + '\nreturn SVG;')();
  await import(`./ui/canvas.js#${crypto.randomUUID()}`);
  const g = (globalThis as any).SvgCanvas;
  const near = (a: number, b: number) => ok(Math.abs(a - b) < 1e-8, `${a} should be ${b}`);
  const m = g.matrix('translate(100 50) rotate(90 10 20) scale(2 3)');
  const p = g.point(m, { x: 3, y: 4 });
  near(p.x, 118); near(p.y, 66);
  const back = g.point(g.inverse(m), p); near(back.x, 3); near(back.y, 4);
  const parent = g.matrix('translate(20 30) rotate(30) scale(2)');
  const a = g.point(g.inverse(parent), {x:100,y:200});
  const b = g.point(g.inverse(parent), {x:120,y:240});
  const delta = g.point(parent, {x:b.x-a.x,y:b.y-a.y});
  // Account for parent translation when mapping a delta as a point.
  near(delta.x - parent[4], 20); near(delta.y - parent[5], 40);
  eq(g.inverse(g.matrix('scale(0)')), null);
  eq(g.matrix('matrix(1 0 0 1 12 15)'), [1,0,0,1,12,15]);
  const skew = g.point(g.matrix('skewX(45)'), {x:10,y:20}); near(skew.x,30); near(skew.y,20);
});
