(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = $('source'), image = $('image'), viewport = $('viewport');
  let doc = null, revision = 0, editQueue = Promise.resolve(), validation = {}, timer;
  let scale = 1, dimensions = [800, 500], fitMode = true, pathMode = 'open', operation = false;
  let latestUrl = '', drag = null, fileError = '', pendingEdits = 0;
  let textTarget = null, styleTarget = null, sourceConflict = null;
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
    $('undo').disabled = operation || !doc?.canUndo; $('redo').disabled = operation || !doc?.canRedo;
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
    canvas.scale(scale);
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
    $('overlay').hidden = !!validation.error || image.hidden || !!sourceConflict;
    message();
  }
  image.addEventListener('error', () => { validation = { error: 'The image renderer could not display this SVG. Check dimensions and inline resources.' }; image.hidden = true; $('preview-empty').hidden = false; message(); });
  function localDraft() {
    try { if (doc) localStorage.setItem(`svg-editor:${doc.id}`, JSON.stringify({ text: source.value, revision, baseText: doc.text })); }
    catch { fileError = 'Local recovery storage is unavailable. Keep this window open until the draft is acknowledged or saved.'; }
  }
  function edit() {
    if (!doc) return;
    fileError = ''; const expectedRevision = revision; revision++; localDraft(); pendingEdits++;
    const args = { id: doc.id, text: source.value, revision, expectedRevision };
    if (sourceConflict) sourceWrites.pause();
    editQueue = sourceWrites.enqueue(args).then(ack => {
      if (doc?.id === ack.id && ack.revision >= revision) {
        doc = ack;
        try { localStorage.removeItem(`svg-editor:${ack.id}`); } catch { /* Backend store is durable. */ }
      }
    }).catch(error => {
      wm.post({ type: '__source_conflict', documentId: args.id, text: doc?.id === args.id ? source.value : args.text });
      if (!sourceConflict) wm.call('state', {}).then(remote => { sourceConflict = remote; }).catch(() => {});
      fileError = 'Source writes are paused. Your local source is kept in Drafts; close SVG source to use the shared version.';
      message(); throw error;
    }).finally(() => { pendingEdits = Math.max(0, pendingEdits - 1); });
    // Keep rejected queue handled until the next command awaits it.
    editQueue.catch(() => {});
    clearTimeout(timer); timer = setTimeout(preview, 180); controls(); position(); message();
    $('filename').textContent = `${doc.name} • Unsaved`;
  }
  function receive(next) {
    const changed = !doc || next.id !== doc.id;
    if (!changed && pendingEdits && next.revision >= revision && source.value !== next.text) {
      sourceConflict = next; fileError = 'The shared document changed while you edited source. Copy your local source, then close and reopen SVG source to use the shared version.'; message(); return;
    }
    if (!changed && next.revision < revision) return;
    const replaceText = changed || source.value !== next.text;
    doc = next; revision = next.revision;
    if (replaceText) source.value = next.text;
    if (changed) {
      image.hidden = true; latestUrl = ''; fitMode = true; canvas.select(null);
      // A local edit can survive a page close before the isolate acknowledged it.
      try {
        const saved = JSON.parse(localStorage.getItem(`svg-editor:${next.id}`) || 'null');
        if (saved && saved.text !== next.text) {
          source.value = saved.text;
          if (SvgSourceSync.canReplay(saved, next)) { revision = next.revision; edit(); }
          else {
            sourceConflict = next; sourceWrites.pause(); fileError = 'Recovered local source differs from the shared document. Copy it, then close SVG source to use the shared version.';
            $('workspace').classList.remove('preview-only'); $('source-toggle').setAttribute('aria-pressed', 'true');
          }
        }
      } catch { /* Persisted isolate draft remains authoritative when cache is unreadable. */ }
    }
    $('filename').textContent = `${doc.name}${source.value !== doc.savedText ? ' • Unsaved' : ''}`;
    $('filename').title = doc.path || 'Not saved to a file';
    canvas.update({ ...next.scene, documentId: next.id, revision: next.revision });
    if (next.selectedKey) canvas.select(next.selectedKey);
    controls(); position();
    if (replaceText || changed) preview(); else message();
  }
  async function call(command, args = {}) {
    if (operation) { notice('Wait for the current edit to finish.'); return false; }
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
    $('file-menu').open = false; $('path-dialog').showModal(); $('path').focus();
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
  $('source-toggle').onclick = async () => {
    $('file-menu').open = false;
    if (sourceWrites.blocked && !sourceConflict) { try { sourceConflict = await wm.call('state', {}); } catch { notice('The shared document is unavailable. Keep your source copied before closing.', 'red'); return; } }
    if (sourceConflict) {
      if (!confirm('Use the current shared document? Copy your local source before continuing; this replaces the local source field.')) return;
      pendingEdits = 0; revision = -1; sourceWrites.reset(); try { localStorage.removeItem(`svg-editor:${doc.id}`); } catch {} const next = sourceConflict; sourceConflict = null; fileError = ''; editQueue = Promise.resolve(); receive(next);
    }
    const hide = $('workspace').classList.toggle('preview-only'); $('source-toggle').setAttribute('aria-pressed', String(!hide)); resizeImage(); };
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
    if (!['INPUT', 'TEXTAREA'].includes(event.target.tagName) && event.key.toLowerCase() === 'z') { event.preventDefault(); mutate(event.shiftKey ? 'redo' : 'undo'); return; }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); event.shiftKey ? pathSheet('save') : save(); }
    if (event.key.toLowerCase() === 'o') { event.preventDefault(); pathSheet('open'); }
  });
  window.addEventListener('beforeunload', event => { if (doc && source.value !== doc.savedText) { localDraft(); } });
  function selected(it) {
    $('style').hidden = !it; $('delete').hidden = !it;
    $('selected-name').textContent = it ? (it.type === 'text' ? 'Text' : it.type[0].toUpperCase() + it.type.slice(1)) : 'Choose a tool, or click an object to select it.';
    $('edit-label').hidden = it?.type !== 'text';
  }
  function editText(target) {
    textTarget = { ...target, documentId: doc.id, expectedRevision: doc.revision };
    $('text-title').textContent = target.key ? 'Edit text' : 'Add text';
    $('label-text').value = target.key ? target.text : 'Text';
    $('text-dialog').showModal(); $('label-text').focus(); $('label-text').select();
  }
  async function mutate(command, args = {}) {
    if (!doc || sourceConflict || sourceWrites.blocked) { notice('Resolve the shared source change before drawing.', 'amber'); return false; }
    const stamp = { documentId: doc.id, expectedRevision: doc.revision, ...args };
    return call(command, stamp);
  }
  const sourceWrites = SvgSourceSync.create(args => wm.call('edit', args));
  const canvas = SvgCanvas.setup({ overlay: $('overlay'), onCommand: mutate, onSelection: selected, onText: editText, onError: error => { fileError = error; message(); } });
  document.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => { canvas.setTool(button.dataset.tool); $('overlay').focus(); });
  $('text-cancel').onclick = () => $('text-dialog').close();
  $('text-form').onsubmit = async event => {
    event.preventDefault(); const target = textTarget; $('text-dialog').close();
    const stamp = { documentId: target.documentId, expectedRevision: target.expectedRevision };
    if (target.key) await mutate('set', { ...stamp, key: target.key, property: 'text', value: $('label-text').value });
    else await mutate('add', { ...stamp, type: 'text', x: target.x, y: target.y, text: $('label-text').value });
    canvas.setTool('select'); $('overlay').focus();
  };
  $('edit-label').onclick = () => { if (canvas.selected) editText(canvas.selected); };
  $('delete').onclick = () => { if (canvas.selected) mutate('remove', { key: canvas.selected.key }); };
  $('undo').onclick = () => mutate('undo'); $('redo').onclick = () => mutate('redo');
  $('style').onclick = () => {
    const it = canvas.selected; if (!it) return;
    styleTarget = { key: it.key, documentId: doc.id, expectedRevision: doc.revision };
    const a = it.attributes, declarations = Object.fromEntries((a.style || '').split(';').filter(s => s.includes(':')).map(s => { const i=s.indexOf(':'); return [s.slice(0,i).trim(), s.slice(i+1).trim()]; }));
    $('fill').value = declarations.fill || a.fill || (it.type === 'text' ? '#1f2937' : 'none'); $('stroke').value = declarations.stroke || a.stroke || 'none';
    $('stroke-width').value = parseFloat(declarations['stroke-width'] || a['stroke-width']) || 2;
    $('font-size-field').hidden = it.type !== 'text'; $('font-size').value = parseFloat(declarations['font-size'] || a['font-size']) || 24;
    $('style-dialog').showModal();
  };
  $('style-cancel').onclick = () => $('style-dialog').close();
  $('style-form').onsubmit = async event => {
    event.preventDefault(); $('style-dialog').close();
    const target = styleTarget;
    const changes = [['fill', $('fill').value], ['stroke', $('stroke').value], ['stroke-width', $('stroke-width').value]];
    if (!$('font-size-field').hidden) changes.push(['font-size', $('font-size').value]);
    let expectedRevision = target.expectedRevision;
    for (const [property,value] of changes) {
      if (!await mutate('set', { ...target, expectedRevision, property, value })) break;
      expectedRevision = doc.revision;
    }
  };
  $('objects').onclick = () => {
    $('file-menu').open = false; const list = $('object-list'); list.replaceChildren();
    for (const item of canvas.items) {
      const button = document.createElement('button'); button.textContent = item.type + (item.text ? ': ' + item.text.slice(0,80) : item.attributes.id ? ': ' + item.attributes.id : '');
      button.onclick = () => { canvas.select(item.key); $('objects-dialog').close(); $('overlay').focus(); }; list.appendChild(button);
    }
    if (!canvas.items.length) list.textContent = 'Draw a box, line, ellipse or text to begin.';
    $('objects-dialog').showModal();
  };
  $('objects-close').onclick = () => $('objects-dialog').close();
  document.addEventListener('keydown', event => {
    if (['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) || document.querySelector('dialog[open]') || event.metaKey || event.ctrlKey || event.altKey) return;
    const tools = { v:'select',r:'rect',e:'ellipse',l:'line',t:'text',h:'hand' };
    if (tools[event.key.toLowerCase()]) { event.preventDefault(); canvas.setTool(tools[event.key.toLowerCase()]); $('overlay').focus(); }
    if (event.key === 'Escape') { canvas.cancel(); canvas.select(null); canvas.setTool('select'); }
    if (['Delete','Backspace'].includes(event.key) && canvas.selected) { event.preventDefault(); mutate('remove', { key: canvas.selected.key }); }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) && canvas.selected && event.target === $('overlay')) {
      event.preventDefault(); const step=event.shiftKey?10:1;
      mutate('move',{key:canvas.selected.key,dx:event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy:event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0});
    }
    if (['[',']'].includes(event.key) && event.target === $('overlay') && canvas.items.length) {
      event.preventDefault(); const index=canvas.items.findIndex(it=>it.key===canvas.selected?.key); canvas.select(canvas.items[(index+(event.key===']'?1:-1)+canvas.items.length)%canvas.items.length].key);
    }
  });

  wm.onMessage(msg => { if (msg.type === 'document') receive(msg); if (msg.type === 'error') { fileError = msg.message; message(); } });
  wm.call('state', {}).then(receive).catch(error => { fileError = error.message || String(error); message(); });
})();
