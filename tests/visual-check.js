// Native WebKit integration assertions. Load only in a disposable test window.
globalThis.runVisualEditorChecks = async function () {
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)), results=[];globalThis.__visualResults=results;
  const $=id=>document.getElementById(id), source=$('source'), overlay=$('overlay');
  const check=(value,name)=>{if(!value)throw new Error(name);results.push(name);};
  async function wait(fn,name){for(let i=0;i<100;i++){if(await fn())return;await pause(40);}throw new Error('Timeout: '+name);}
  const state=()=>wm.call('state',{}), scene=()=>wm.call('objects',{});
  async function stamp(){const s=await state();return{documentId:s.id,expectedRevision:s.revision};}
  async function synced(){ await wait(async()=>{const s=await state();return overlay.dataset.documentId===s.id&&+overlay.dataset.revision===s.revision;},'human view synchronized'); }
  async function drag(tool,a,b){
    await synced();
    document.querySelector(`[data-tool="${tool}"]`).click();const s=await state(),v=s.scene.viewBox,r=overlay.getBoundingClientRect();
    const pointer=(kind,p)=>overlay.dispatchEvent(new PointerEvent(kind,{bubbles:true,button:0,pointerId:7,clientX:r.left+(p[0]-v[0])/v[2]*r.width,clientY:r.top+(p[1]-v[1])/v[3]*r.height}));
    pointer('pointerdown',a);pointer('pointermove',b);pointer('pointerup',b);
    await wait(async()=> (await state()).revision>s.revision,'canvas '+tool+' gesture; '+$('notice-text').textContent); await synced();
  }
  await wm.call('discard',{});await wm.call('newDocument',{});await synced();
  await wait(()=>!overlay.hidden&&overlay.getBoundingClientRect().width>0,'canvas ready');
  check($('workspace').classList.contains('preview-only'),'Canvas first; source hidden by default');
  check(document.querySelectorAll('[data-tool]').length===6,'Six essential tools without illustration panels');
  await drag('rect',[80,80],[240,180]);
  check((await scene()).objects[0].type==='rect','Human draws a box by dragging');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await pause(60);const beforeSelect=await state(),beforeRect=overlay.getBoundingClientRect(),vb=beforeSelect.scene.viewBox;
  const selectPoint={clientX:beforeRect.left+(120-vb[0])/vb[2]*beforeRect.width,clientY:beforeRect.top+(120-vb[1])/vb[3]*beforeRect.height};
  overlay.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,...selectPoint}));
  await pause(100);overlay.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,...selectPoint}));await pause(100);
  check((await state()).revision===beforeSelect.revision,'A first selection click never moves the object');
  const afterRect=overlay.getBoundingClientRect();check(Math.abs(beforeRect.left-afterRect.left)<.1&&Math.abs(beforeRect.top-afterRect.top)<.1&&Math.abs(beforeRect.width-afterRect.width)<.1,'Selection actions do not shift or rescale the canvas');

  await drag('ellipse',[350,100],[480,200]);
  check((await scene()).objects.some(o=>o.type==='ellipse'),'Human draws an ellipse');
  await drag('line',[200,260],[400,340]);
  check((await scene()).objects.some(o=>o.type==='line'),'Human draws a line');
  document.querySelector('[data-tool="text"]').click();
  const v=(await state()).scene.viewBox,r=overlay.getBoundingClientRect();overlay.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.left+80/v[2]*r.width,clientY:r.top+400/v[3]*r.height}));
  await wait(()=>$('text-dialog').open,'text dialog');$('label-text').value='Service → Queue';$('text-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(async()=>(await scene()).objects.some(o=>o.text==='Service → Queue'),'text created');
  check(true,'Human adds a text label on canvas');
  await drag('select',[120,120],[160,160]);
  let objects=(await scene()).objects,box=objects.find(o=>o.type==='rect');
  check(box.attributes.transform==='translate(40 40)','Direct selection and drag move the shared box');
  await drag('select',[280,220],[320,250]);
  box=(await scene()).objects.find(o=>o.type==='rect');
  check(Math.abs(+box.attributes.width-200)<1&&Math.abs(+box.attributes.height-130)<1,'Selection corner resizes the shared box');
  let text=(await scene()).objects.find(o=>o.type==='text');
  await wm.call('set',{...await stamp(),key:text.key,property:'text',value:'Agent updated label'});
  await wait(()=>source.value.includes('Agent updated label'),'shared agent update');
  check(true,'Structured agent edit updates the same SVG and human view');
  $('objects').click();const button=Array.from($('object-list').querySelectorAll('button')).find(b=>b.textContent.includes('Agent updated label'));button.click();
  $('edit-label').click();$('label-text').value='Human updated label';$('text-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(async()=>(await scene()).objects.some(o=>o.text==='Human updated label'),'human label update');
  check(true,'Human text edit is visible to the structured agent interface');
  const old=await stamp();await wm.call('add',{...old,type:'rect',x:550,y:80,width:120,height:80,fill:'#e2e8f0'});
  try{await wm.call('move',{...old,key:box.key,dx:100,dy:100});throw new Error('stale accepted');}catch(error){check(String(error.message||error).includes('document changed'),'Stale agent mutations are rejected');}
  await synced();await wait(()=>!$('undo').disabled,'undo enabled');const beforeUndo=(await state()).text;$('undo').click();await wait(async()=>(await state()).text!==beforeUndo,'undo');await synced();await wait(()=>!$('redo').disabled,'redo enabled');$('redo').click();await wait(async()=>(await state()).text===beforeUndo,'redo');
  check(true,'Shared undo and redo work across human and agent edits');
  await synced();const path=`/private/tmp/svg-editor-check/visual-${Date.now()}.svg`;await wm.call('save',{path});
  const saved=(await state()).text;
  await wm.call('open',{path});check((await state()).text===saved&&(await scene()).objects.length===5,'Drawn diagram saves and reopens through real file commands');
  check(!(await state()).dirty,'Save clears dirty state');
  await wm.call('open',{path:'/private/tmp/svg-editor-check/architecture.svg'});
  const imported=await state();check(imported.scene.objects.length>25&&!imported.scene.error,'Imported architecture SVG exposes selectable objects');
  const importedText=imported.scene.objects.find(o=>o.type==='text'&&o.text.includes('Memory that can stand'));
  check(!!importedText,'Architecture heading is addressable by an agent');
  const prefix=imported.text.slice(0,imported.text.indexOf('<rect'));
  await wm.call('set',{...await stamp(),key:importedText.key,property:'text',value:'Updated on the shared canvas'});
  check((await state()).text.startsWith(prefix),'Imported definitions, gradients and styles remain intact');
  await wm.call('undo',{...await stamp()});check((await state()).text===imported.text,'Undo exactly restores imported SVG');
  if(globalThis.runSvgPreviewChecks)for(const name of runSvgPreviewChecks(SvgPreview.validate))results.push(name);
  return {ok:true,results,path};
};
