// Optional real-WebKit/OS integration harness. Open /checks with Wonop browser_open.
// deno run --allow-read --allow-write=/private/tmp/svg-editor-check --allow-run=/usr/bin/head,/usr/bin/mktemp,/usr/bin/tee,/bin/mv,/bin/rm --allow-net=127.0.0.1:8147 tests/browser-check.ts
const folder = '/private/tmp/svg-editor-check';
await Deno.mkdir(folder, { recursive: true });
await Deno.remove(`${folder}/saved.svg`).catch(error => { if (!(error instanceof Deno.errors.NotFound)) throw error; });
const original = '/private/tmp/wonopstudio-pagesprinter-migration/memory-architecture.svg';
const sample = await Deno.readTextFile(original);
await Deno.writeTextFile(`${folder}/architecture.svg`, sample);
let spec: any, store: any = null;
const labels: Record<string, any> = {}, posted: any[] = [];
(globalThis as any).workspace = { sources: [{ primary: true, path: folder }] };
(globalThis as any).app = {
  define(value: any) { spec = value; },
  store: { get() { return store; }, set(value: any) { store = structuredClone(value); } },
  tabs: { set(id: string, fields: any) { labels[id] = fields; return Promise.resolve({ ok: true }); } },
  ui: { post(payload: any, windowId: string) { posted.push({ payload, windowId }); } },
  async exec(argv: string[], opts: any = {}) {
    const paths: Record<string, string> = { head: '/usr/bin/head', mktemp: '/usr/bin/mktemp', tee: '/usr/bin/tee', mv: '/bin/mv', rm: '/bin/rm' };
    if (!paths[argv[0]]) throw new Error('Unexpected binary');
    // Harness writes are confined to disposable test files; original sample is read-only.
    if (argv[0] !== 'head' && argv.slice(1).some(a => !a.startsWith('-') && !a.startsWith(folder + '/'))) throw new Error('Test write outside disposable folder');
    const child = new Deno.Command(paths[argv[0]], { args: argv.slice(1), stdin: opts.stdin === undefined ? 'null' : 'piped', stdout: 'piped', stderr: 'piped' }).spawn();
    if (opts.stdin !== undefined) { const writer = child.stdin.getWriter(); await writer.write(new TextEncoder().encode(opts.stdin)); await writer.close(); }
    const out = await child.output(); return { code: out.code, stdout: new TextDecoder().decode(out.stdout), stderr: new TextDecoder().decode(out.stderr) };
  },
};
await import('../main.ts');
const ctx = { windowId: 'check', hostId: 'check', caller: 'browser-check' };
await spec.onOpen({ windowId: 'check' });
await spec.commands.open({ path: `${folder}/architecture.svg` }, ctx);
const bridge = `<style>:root{--wm-bg:#fafafa;--wm-chrome:#f0f0f2;--wm-text:#252529;--wm-text-dim:#606068;--wm-hairline:#d8d8dd;--wm-hover:#e3e3e7}wm-notice{display:flex;gap:12px;padding:10px 12px;line-height:1.5;background:#fff4dd}wm-notice[tone=red]{background:#fff0ed;color:#922e24}</style><script>globalThis.wm={listeners:[],onMessage(fn){this.listeners.push(fn)},async call(command,args={}){const res=await fetch('/api',{method:'POST',body:JSON.stringify({command,args})});const data=await res.json();if(data.error)throw new Error(data.error);for(const msg of data.messages)for(const fn of this.listeners)fn(msg.payload);return data.result}};</script>`;
const checks = `<!doctype html><html><title>SVG Editor integration checks</title><style>body{font:15px system-ui}iframe{width:1100px;height:760px;border:0}pre{white-space:pre-wrap}</style><h1>SVG Editor checks</h1><pre id=results>Running…</pre><iframe id=editor src=/ui></iframe><script src=/preview-check.js></script><script src=/checks.js></script></html>`;
Deno.serve({ hostname: '127.0.0.1', port: 8147 }, async req => {
  const path = new URL(req.url).pathname;
  if (path === '/api' && req.method === 'POST') {
    posted.length = 0;
    try { const {command,args} = await req.json(); const result = await spec.commands[command](args,ctx); return Response.json({ result, messages: posted }); }
    catch (error) { return Response.json({error:(error as Error).message}); }
  }
  if (path === '/checks') return new Response(checks, { headers: { 'content-type': 'text/html' } });
  if (path === '/preview-check.js') return new Response(await Deno.readTextFile(new URL('./preview-check.js', import.meta.url)), {headers:{'content-type':'text/javascript'}});
  if (path === '/checks.js') return new Response(await Deno.readTextFile(new URL('./browser-check.js', import.meta.url)), {headers:{'content-type':'text/javascript'}});
  if (path === '/assertions') return Response.json({ labels, stored: store, originalUnchanged: await Deno.readTextFile(original) === sample, files: await Deno.readTextFile(`${folder}/saved.svg`).catch(()=>null) });
  if (path === '/ui') return new Response((await Deno.readTextFile(new URL('../ui/index.html', import.meta.url))).replace('<script src="preview.js">', bridge + '<script src="preview.js">'), {headers:{'content-type':'text/html'}});
  if (path === '/editor.js' || path === '/preview.js') return new Response(await Deno.readTextFile(new URL('../ui'+path, import.meta.url)), {headers:{'content-type':'text/javascript'}});
  return new Response('Not found',{status:404});
});
