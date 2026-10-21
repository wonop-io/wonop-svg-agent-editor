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
  const h = { spec: null as any, files: new Map<string, string>(), directories: new Set<string>(), posts: [] as any[], labels: new Map<string, any>(), calls: [] as any[], stored: saved, seq: 0, failWrite: false, beforeMove: null as null | (() => void), gate: null as null | (() => Promise<void>) };
  (globalThis as any).workspace = { sources: [{ primary: true, path: '/workspace' }] };
  (globalThis as any).app = {
    define(spec: any) { h.spec = spec; },
    ui: { post(payload: any, windowId: string) { h.posts.push({ payload, windowId }); } },
    tabs: { set(id: string, fields: any) { h.labels.set(id, fields); return Promise.resolve({ ok: true }); } },
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
  const edit = (text: string, windowId = 'w1') => { const s = command('state', {}, windowId); return command('edit', { id: s.id, text, revision: s.revision + 1 }, windowId); };
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
  h.command('edit', { id: a.id, text: 'late', revision: 0 }); eq(h.command('state').text, 'invalid SVG');
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
