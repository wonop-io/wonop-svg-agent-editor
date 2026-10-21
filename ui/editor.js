(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = $('source'), image = $('image'), viewport = $('viewport');
  let doc = null, revision = 0, editQueue = Promise.resolve(), validation = {}, timer;
  let scale = 1, dimensions = [800, 500], fitMode = true, pathMode = 'open', operation = false;
  let latestUrl = '', drag = null, fileError = '';
  function notice(message, tone = 'amber', locate = false) {
    $('notice').hidden = !message; $('notice').setAttribute('tone', tone);
    $('notice-text').textContent = message; $('locate-error').hidden = !locate;
  }
  function message() {
    if (fileError) return notice(fileError, 'red');
    if (validation.error) return notice(`${validation.error} ${latestUrl ? 'Showing the last valid preview. ' : ''}Your source is kept.`, 'red', !!validation.line);
    if (validation.external) return notice('External images, fonts and styles are unavailable in this safe preview. Use inline resources.');
    notice(doc && source.value !== doc.savedText ? 'Unsaved edits. Your draft is kept for recovery.' : '');
  }
  function controls() {
    $('save').disabled = operation || !doc;
    $('save-as').disabled = operation || !doc;
    $('discard').disabled = operation || !doc || source.value === doc.savedText;
  }
  function position() {
    const before = source.value.slice(0, source.selectionStart), lines = before.split('\n');
    $('position').textContent = `Line ${lines.length}, col ${lines[lines.length - 1].length + 1}`;
  }
  function resizeImage() {
    if (fitMode) scale = Math.min((viewport.clientWidth - 48) / dimensions[0], (viewport.clientHeight - 48) / dimensions[1]);
    scale = Math.max(.01, Math.min(8, scale));
    image.style.width = `${dimensions[0] * scale}px`; image.style.height = `${dimensions[1] * scale}px`;
    $('zoom-value').textContent = `${Math.round(scale * 100)}%`;
  }
  function zoom(value) {
    const old = scale, cx = (viewport.scrollLeft + viewport.clientWidth / 2) / old, cy = (viewport.scrollTop + viewport.clientHeight / 2) / old;
    fitMode = false; scale = Math.max(.01, Math.min(8, value)); resizeImage();
    viewport.scrollLeft = cx * scale - viewport.clientWidth / 2; viewport.scrollTop = cy * scale - viewport.clientHeight / 2;
  }
  function preview() {
    validation = SvgPreview.validate(source.value);
    if (validation.url) {
      dimensions = [validation.width, validation.height]; latestUrl = validation.url;
      image.src = latestUrl; image.hidden = false; $('preview-empty').hidden = true; resizeImage();
    }
    message();
  }
  image.addEventListener('error', () => { validation = { error: 'The image renderer could not display this SVG. Check dimensions and inline resources.' }; image.hidden = true; $('preview-empty').hidden = false; message(); });
  function localDraft() {
    try { if (doc) localStorage.setItem(`svg-editor:${doc.id}`, JSON.stringify({ text: source.value, revision })); }
    catch { fileError = 'Local recovery storage is unavailable. Keep this window open until the draft is acknowledged or saved.'; }
  }
  function edit() {
    if (!doc) return;
    fileError = ''; revision++; localDraft();
    const args = { id: doc.id, text: source.value, revision };
    editQueue = editQueue.catch(() => {}).then(() => wm.call('edit', args)).then(ack => {
      if (doc?.id === ack.id && ack.revision >= revision) {
        doc = ack;
        try { localStorage.removeItem(`svg-editor:${ack.id}`); } catch { /* Backend store is durable. */ }
      }
    }).catch(error => { fileError = `Draft could not be kept: ${error.message || error}. Keep this window open and copy your source before closing.`; message(); throw error; });
    // Keep rejected queue handled until the next command awaits it.
    editQueue.catch(() => {});
    clearTimeout(timer); timer = setTimeout(preview, 180); controls(); position(); message();
    $('filename').textContent = `${doc.name} • Unsaved`;
  }
  function receive(next) {
    const changed = !doc || next.id !== doc.id;
    if (!changed && next.revision < revision) return;
    const replaceText = changed || source.value !== next.text;
    doc = next; revision = next.revision;
    if (replaceText) source.value = next.text;
    if (changed) {
      image.hidden = true; latestUrl = ''; fitMode = true;
      // A local edit can survive a page close before the isolate acknowledged it.
      try {
        const saved = JSON.parse(localStorage.getItem(`svg-editor:${next.id}`) || 'null');
        if (saved && saved.revision > revision && saved.text !== next.text) {
          source.value = saved.text; revision = saved.revision; edit();
        }
      } catch { /* Persisted isolate draft remains authoritative when cache is unreadable. */ }
    }
    $('filename').textContent = `${doc.name}${source.value !== doc.savedText ? ' • Unsaved' : ''}`;
    $('filename').title = doc.path || 'Not saved to a file';
    controls(); position();
    if (replaceText || changed) preview(); else message();
  }
  async function call(command, args = {}) {
    fileError = ''; operation = true; controls();
    try { await editQueue; const next = await wm.call(command, args); receive(next); return true; }
    catch (error) { fileError = error.message || String(error); message(); return false; }
    finally { operation = false; controls(); }
  }
  function pathSheet(mode) {
    pathMode = mode; $('path-title').textContent = mode === 'open' ? 'Open SVG' : 'Save SVG as';
    $('path-submit').textContent = mode === 'open' ? 'Open' : 'Save';
    $('path-help').textContent = mode === 'open' ? 'Enter an absolute path or a path relative to this workspace.' : 'Choose a new .svg file. Existing files are never overwritten by Save as.';
    $('path').value = mode === 'save' ? doc?.path?.replace(/\.svg$/i, '-copy.svg') || '' : '';
    $('path-dialog').showModal(); $('path').focus();
  }
  function save() {
    if (!doc) return;
    preview();
    if (!doc.path) return pathSheet('save');
    if (validation.error && !confirm('This SVG has validation errors. Save the source anyway? Your edits will be saved exactly as written.')) return;
    call('save');
  }
  source.addEventListener('input', edit);
  source.addEventListener('click', position); source.addEventListener('keyup', position);
  source.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); document.execCommand('insertText', false, '  '); }
  });
  $('open').onclick = () => pathSheet('open'); $('save-as').onclick = () => pathSheet('save'); $('save').onclick = save;
  $('new').onclick = () => call('newDocument');
  $('discard').onclick = () => $('discard-dialog').showModal();
  $('discard-cancel').onclick = () => $('discard-dialog').close();
  $('discard-confirm').onclick = async () => { $('discard-dialog').close(); await call('discard'); };
  $('path-cancel').onclick = () => $('path-dialog').close();
  $('path-form').onsubmit = async event => {
    event.preventDefault(); const path = $('path').value;
    if (pathMode === 'save') preview();
    if (pathMode === 'save' && validation.error && !confirm('Save this source with SVG validation errors?')) return;
    $('path-dialog').close(); if (await call(pathMode === 'open' ? 'open' : 'save', { path })) source.focus();
  };
  $('source-toggle').onclick = () => { const hide = $('workspace').classList.toggle('preview-only'); $('source-toggle').setAttribute('aria-pressed', String(!hide)); resizeImage(); };
  $('fit').onclick = () => { fitMode = true; resizeImage(); viewport.scrollTo(0, 0); };
  $('actual').onclick = () => zoom(1); $('zoom-in').onclick = () => zoom(scale * 1.25); $('zoom-out').onclick = () => zoom(scale / 1.25);
  $('paper').onchange = () => { image.className = `paper-${$('paper').value}`; };
  $('locate-error').onclick = () => {
    if ($('workspace').classList.contains('preview-only')) $('source-toggle').click();
    const lines = source.value.split('\n'); let offset = 0;
    for (let i = 0; i < Math.min(validation.line - 1, lines.length); i++) offset += lines[i].length + 1;
    offset += Math.max(0, (validation.column || 1) - 1);
    source.focus(); source.setSelectionRange(offset, offset); source.scrollTop = Math.max(0, (validation.line - 3) * 21.45); position();
  };
  $('drafts').onclick = async () => {
    try {
      await editQueue; const next = await wm.call('state', {}); const list = $('draft-list'); list.replaceChildren();
      for (const draft of next.drafts) {
        const button = document.createElement('button'); button.textContent = draft.path || draft.name;
        if (draft.id === doc?.id) { button.textContent += ' (current)'; button.disabled = true; }
        button.onclick = async () => { $('draft-dialog').close(); await call('recover', { id: draft.id }); };
        list.appendChild(button);
      }
      if (!next.drafts.length) list.textContent = 'No unsaved drafts.';
      $('draft-dialog').showModal();
    } catch (error) { fileError = error.message || String(error); message(); }
  };
  $('draft-close').onclick = () => $('draft-dialog').close();
  viewport.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoom(scale * Math.exp(-event.deltaY * .01)); } }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId); viewport.classList.add('panning');
  });
  viewport.addEventListener('pointermove', event => { if (drag) { viewport.scrollLeft = drag.left - event.clientX + drag.x; viewport.scrollTop = drag.top - event.clientY + drag.y; } });
  function stopDrag() { drag = null; viewport.classList.remove('panning'); }
  viewport.addEventListener('pointerup', stopDrag); viewport.addEventListener('pointercancel', stopDrag);
  viewport.addEventListener('keydown', event => { if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(scale * 1.25); } if (event.key === '-') { event.preventDefault(); zoom(scale / 1.25); } if (event.key === '0') { event.preventDefault(); $('fit').click(); } });
  new ResizeObserver(() => { if (fitMode) resizeImage(); }).observe(viewport);
  document.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 's') { event.preventDefault(); event.shiftKey ? pathSheet('save') : save(); }
    if (event.key.toLowerCase() === 'o') { event.preventDefault(); pathSheet('open'); }
  });
  window.addEventListener('beforeunload', event => { if (doc && source.value !== doc.savedText) { localDraft(); } });
  wm.onMessage(msg => { if (msg.type === 'document') receive(msg); if (msg.type === 'error') { fileError = msg.message; message(); } });
  wm.call('state', {}).then(receive).catch(error => { fileError = error.message || String(error); message(); });
})();
