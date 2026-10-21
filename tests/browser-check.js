(async () => {
  const output = document.getElementById('results'), frame = document.getElementById('editor'), results = [];
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (fn, label) => { for (let i = 0; i < 80; i++) { if (fn()) return; await pause(50); } throw new Error(label); };
  const check = (condition, label) => { if (!condition) throw new Error(label); results.push('PASS '+label); output.textContent = results.join('\n'); };
  try {
    await wait(() => frame.contentDocument?.getElementById('source')?.value.includes('Memory that can stand'), 'Initial document did not load');
    const w = frame.contentWindow, d = frame.contentDocument, $ = id => d.getElementById(id), source = $('source'), image = $('image');
    await wait(() => image.complete && image.naturalWidth > 0, 'Architecture image did not render');
    check(true, 'Architecture sample renders in WebKit image context');
    for (const label of runSvgPreviewChecks(w.SvgPreview.validate)) check(true, label);
    check(d.getElementById('workspace').classList.contains('preview-only'), 'Canvas-first layout hides source by default');
    d.getElementById('source-toggle').click();
    const original = source.value, initialUrl = image.src;
    source.value = original.replaceAll('Memory that can stand on its own', 'Edited architecture label'); source.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(() => image.src !== initialUrl && image.complete, 'Live preview did not update');
    check(decodeURIComponent(image.src).includes('Edited architecture label'), 'Label edit updates the live preview');
    const valid = source.value, validUrl = image.src;
    source.value = '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'; source.dispatchEvent(new w.Event('input', {bubbles:true}));
    await wait(() => $('notice-text').textContent.includes('last valid preview'), 'Invalid XML feedback missing');
    check(source.value.includes('<g></svg>') && image.src === validUrl, 'Invalid XML retains edits and last valid preview');
    check(!$('locate-error').hidden, 'Parser error provides a line/column navigation action');
    source.value = valid; source.dispatchEvent(new w.Event('input', {bubbles:true})); await pause(300);
    const state = await w.wm.call('state'); check(state.dirty, 'Native dirty flag and persistent draft are set');
    try { await w.wm.call('open', { path:'architecture.svg' }); check(false,'guard'); } catch (error) { check(error.message.includes('Save or discard'), 'Open refuses to discard unsaved source'); }
    $('save-as').click(); $('path').value = 'saved.svg'; $('path-form').dispatchEvent(new w.Event('submit', {bubbles:true,cancelable:true}));
    await wait(() => $('filename').textContent === 'saved.svg', 'Save as did not complete');
    await w.wm.call('open', {path:'saved.svg'}); check(source.value === valid, 'Real filesystem save and reopen preserve edited source');
    const assertion = await (await fetch('/assertions')).json(); check(assertion.originalUnchanged && assertion.files === valid && !assertion.labels.check.dirty, 'Original sample unchanged; saved bytes match; dirty mark cleared');
    const oldWidth = image.style.width; $('zoom-in').click(); check(image.style.width !== oldWidth, 'Zoom changes preview size'); $('actual').click();
    const viewport = $('viewport'); viewport.scrollLeft = 200; viewport.scrollTop = 100;
    viewport.scrollLeft += 50; viewport.scrollTop += 50;
    check(viewport.scrollLeft > 200 || viewport.scrollTop > 100, 'Scroll pan moves the enlarged architecture diagram');
    $('fit').click(); $('source-toggle').click(); check($('workspace').classList.contains('preview-only'), 'Preview can fill the window'); $('source-toggle').click();
    check(!w.SvgPreview.validate('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#paint)"/></svg>').external, 'Namespace and fragment references do not trigger external warning');
    check(w.SvgPreview.validate('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/image.png"/></svg>').external, 'Actual external resource reference is identified');
    w.__svgScriptRan = false;
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" onload="parent.__svgScriptRan=true"><script>parent.__svgScriptRan=true</script><foreignObject width="400" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="parent.__svgScriptRan=true"/></div></foreignObject><text y="50">Safe image</text></svg>';
    const rendered = w.SvgPreview.validate(malicious); const probe = d.createElement('img'); probe.src = rendered.url; d.body.append(probe); await pause(400);
    check(w.__svgScriptRan === false && !d.querySelector('main svg'), 'Scripts, SVG event handlers and foreign markup never execute in the app'); probe.remove();
    check(!!w.SvgPreview.validate('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>').error, 'DTD/entity input refused before parsing');
    check(!!w.SvgPreview.validate('<html/>').error && !!w.SvgPreview.validate('<svg/>').error, 'Non-SVG roots and missing namespace rejected');
    frame.style.width = '520px'; frame.style.height='600px'; await pause(100); check(d.documentElement.scrollWidth <= 520, 'Small Wonop window has no horizontal UI overflow');
    frame.style.width='1100px'; frame.style.height='760px';
    output.textContent = results.join('\n') + '\nALL '+results.length+' CHECKS PASSED';
  } catch (error) { output.textContent = results.join('\n')+'\nFAIL '+error.stack; }
})();
