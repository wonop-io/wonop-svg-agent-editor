// Only editor-owned canvas pixels and numeric geometry are drawn here.
// SVG itself remains an isolated image; markup never becomes live page content.
(function () {
  'use strict';
  const I = [1, 0, 0, 1, 0, 0];
  // SVG.js supplies SVG-native affine geometry. Only numeric values/path commands
  // enter it: never SVG markup, style, URLs, .svg(), or document import methods.
  const mul = (a,b) => new SVG.Matrix(a).multiply(b).toArray();
  const point = (m,p) => new SVG.Point(p).transform(m);
  function inverse(m) {
    if(Math.abs(m[0]*m[3]-m[1]*m[2])<1e-12)return null;
    try{return new SVG.Matrix(m).inverse().toArray();}catch{return null;}
  }
  function matrix(value) {
    let m=new SVG.Matrix();
    for(const match of value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
      const v=match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if(!v.length||!v.every(Number.isFinite))continue;
      const method=match[1];
      if(method==='matrix'&&v.length!==6)continue;
      const next=method==='matrix'?new SVG.Matrix(v):new SVG.Matrix()[method](...v);
      m=m.multiply(next);
    }
    return m.toArray();
  }
  function geometryBounds(type,value) {
    try {
      // PathArray parses to SVG command/number tuples before native getBBox;
      // it creates only its own hidden measurement path, never imported markup.
      const box=type==='path'?new SVG.PathArray(value).bbox():new SVG.PointArray(value).bbox();
      return [box.x,box.y,box.width,box.height].every(Number.isFinite)?{x:box.x,y:box.y,w:box.width,h:box.height}:null;
    } catch { return null; }
  }
  function setup({overlay,onCommand,onSelection,onText,onError}) {
    const ctx=overlay.getContext('2d');let data={objects:[],viewBox:[0,0,800,500]},items=[],selected=null,tool='select',gesture=null,zoom=1;
    const num=(a,k,f=0)=>{const n=parseFloat(a[k]);return Number.isFinite(n)?n:f;};
    function item(object) {
      const a={...object.attributes,...object.presentation}, transforms=object.transforms.map(matrix), m=transforms.reduce(mul,I),parent=transforms.slice(0,-1).reduce(mul,I);
      let b={x:0,y:0,w:0,h:0}, path=null;
      if(object.type==='rect')b={x:num(a,'x'),y:num(a,'y'),w:num(a,'width'),h:num(a,'height')};
      if(['circle','ellipse'].includes(object.type)){const rx=num(a,object.type==='circle'?'r':'rx'),ry=num(a,object.type==='circle'?'r':'ry');b={x:num(a,'cx')-rx,y:num(a,'cy')-ry,w:rx*2,h:ry*2};}
      if(object.type==='line'){const x1=num(a,'x1'),y1=num(a,'y1'),x2=num(a,'x2'),y2=num(a,'y2');b={x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1),h:Math.abs(y2-y1)};path=new Path2D();path.moveTo(x1,y1);path.lineTo(x2,y2);}
      if(object.type==='text'){
        const size=num(a,'font-size',24);ctx.font=`${a['font-weight']||'normal'} ${size}px system-ui`;const w=ctx.measureText(object.text).width;
        b={x:num(a,'x')-(a['text-anchor']==='middle'?w/2:a['text-anchor']==='end'?w:0),y:num(a,'y')-size,w:Math.max(w,size/2),h:size*1.3};
      }
      if(['path','polyline','polygon'].includes(object.type)){
        const values=(a[object.type==='path'?'d':'points']||'').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number)||[];
        b=geometryBounds(object.type,a[object.type==='path'?'d':'points']||'')||b;
        try{if(object.type==='path')path=new Path2D(a.d||'');else{path=new Path2D();values.forEach((n,i)=>{if(i%2===0&&i+1<values.length)i===0?path.moveTo(n,values[i+1]):path.lineTo(n,values[i+1]);});if(object.type==='polygon')path.closePath();}}catch{path=null;}
      }
      return {...object,attributes:a,b,m,parent,inverse:inverse(m),path};
    }
    function coord(event){const r=overlay.getBoundingClientRect(),v=data.viewBox;return{x:v[0]+(event.clientX-r.left)/r.width*v[2],y:v[1]+(event.clientY-r.top)/r.height*v[3]};}
    function corners(it){const b=it.b;if(it.type==='line')return[{x:num(it.attributes,'x1'),y:num(it.attributes,'y1')},{x:num(it.attributes,'x2'),y:num(it.attributes,'y2')}];return[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];}
    function handles(it){return ['rect','ellipse','circle','line'].includes(it.type)?corners(it):[];}
    function select(key){selected=items.find(it=>it.key===key)||null;onSelection(selected);draw();}
    function draw(){
      const r=overlay.getBoundingClientRect(),dpr=Math.min(2,globalThis.devicePixelRatio||1),v=data.viewBox;
      const w=Math.max(1,Math.min(4096,Math.round(r.width*dpr))),h=Math.max(1,Math.min(4096,Math.round(r.height*dpr)));
      if(overlay.width!==w)overlay.width=w;if(overlay.height!==h)overlay.height=h;
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.setTransform(w/v[2],0,0,h/v[3],-v[0]*w/v[2],-v[1]*h/v[3]);
      const ink='#17171c';ctx.shadowColor='white';ctx.shadowBlur=2/zoom;
      ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=1.5/zoom;
      if(selected){
        ctx.save();let m=selected.m;
        if(gesture?.kind==='move'){const delta={x:gesture.now.x-gesture.start.x,y:gesture.now.y-gesture.start.y};m=mul([1,0,0,1,delta.x,delta.y],m);}
        ctx.transform(...m);const b=selected.b;
        ctx.setLineDash([5/zoom,3/zoom]);ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.setLineDash([]);
        for(const p of handles(selected)){const s=7/zoom;ctx.fillRect(p.x-s/2,p.y-s/2,s,s);}
        ctx.restore();
      }
      if(gesture&&['draw','resize'].includes(gesture.kind)){
        let a=gesture.start,b=gesture.now;
        if(gesture.kind==='resize'){ctx.save();ctx.transform(...gesture.item.m);a=gesture.anchor;b=point(gesture.item.inverse,gesture.now);}
        const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),rw=Math.abs(a.x-b.x),rh=Math.abs(a.y-b.y);
        ctx.setLineDash([4/zoom,3/zoom]);
        if((gesture.kind==='draw'&&tool==='line')||gesture.item?.type==='line'){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
        else if(tool==='ellipse'||gesture.item?.type==='ellipse'||gesture.item?.type==='circle'){ctx.beginPath();ctx.ellipse(x+rw/2,y+rh/2,rw/2,rh/2,0,0,Math.PI*2);ctx.stroke();}
        else ctx.strokeRect(x,y,rw,rh);
        ctx.setLineDash([]);if(gesture.kind==='resize')ctx.restore();
      }
    }
    function hit(p){
      for(const it of items.slice().reverse()){
        if(!it.inverse||it.attributes.display==='none'||it.attributes.visibility==='hidden')continue;
        const local=point(it.inverse,p),b=it.b,t=6/zoom;
        if(it.path){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.lineWidth=Math.max(num(it.attributes,'stroke-width',2),t*2);const yes=ctx.isPointInStroke(it.path,local.x,local.y)||(it.attributes.fill!=='none'&&it.type!=='line'&&ctx.isPointInPath(it.path,local.x,local.y));ctx.restore();if(yes)return it;}
        else if(local.x>=b.x-t&&local.x<=b.x+b.w+t&&local.y>=b.y-t&&local.y<=b.y+b.h+t)return it;
      }
      return null;
    }
    function send(name,args){return Promise.resolve(onCommand(name,args)).catch(error=>onError(String(error.message||error)));}
    overlay.addEventListener('pointerdown',event=>{
      if(event.button!==0||tool==='hand')return;
      if(data.error){onError('Fix the SVG source before drawing or selecting.');return;}
      event.stopPropagation();event.preventDefault();overlay.focus();const p=coord(event);
      if(tool==='text'){onText({x:p.x,y:p.y});return;}
      if(tool!=='select')gesture={kind:'draw',start:p,now:p};
      else {
        const handle=selected?.inverse?handles(selected).findIndex(h=>{const screen=point(selected.m,h);return Math.hypot(screen.x-p.x,screen.y-p.y)<10/zoom;}):-1;
        if(handle>=0){const hs=handles(selected),anchor=hs.length===2?hs[1-handle]:hs[(handle+2)%4];gesture={kind:'resize',item:selected,anchor,handle,start:p,now:p};}
        else {const it=hit(p);select(it?.key);if(it)gesture={kind:'move',item:it,start:p,now:p};}
      }
      if(gesture){gesture.documentId=data.documentId;gesture.revision=data.revision;gesture.clientStart={x:event.clientX,y:event.clientY};if(event.isTrusted)overlay.setPointerCapture(event.pointerId);}draw();
    });
    overlay.addEventListener('pointermove',event=>{if(gesture){gesture.now=coord(event);draw();}});
    overlay.addEventListener('pointerup',async event=>{
      if(!gesture)return;const g=gesture;gesture=null;g.now=coord(event);draw();
      const stamp={documentId:g.documentId,expectedRevision:g.revision};
      if(Math.hypot(g.clientStart.x-event.clientX,g.clientStart.y-event.clientY)<2)return;
      if(g.kind==='move'){
        const inv=inverse(g.item.parent);if(!inv)return;const a=point(inv,g.start),b=point(inv,g.now);await send('move',{...stamp,key:g.item.key,dx:b.x-a.x,dy:b.y-a.y});
      }else if(g.kind==='draw'){
        const line=tool==='line',x=line?g.start.x:Math.min(g.start.x,g.now.x),y=line?g.start.y:Math.min(g.start.y,g.now.y);
        await send('add',{...stamp,type:tool,x,y,width:line?g.now.x-g.start.x:Math.abs(g.now.x-g.start.x),height:line?g.now.y-g.start.y:Math.abs(g.now.y-g.start.y)});setTool('select');
      }else{
        let b=point(g.item.inverse,g.now),a=g.anchor;const line=g.item.type==='line';if(line&&g.handle===0)[a,b]=[b,a];
        await send('resize',{...stamp,key:g.item.key,x:line?a.x:Math.min(a.x,b.x),y:line?a.y:Math.min(a.y,b.y),width:line?b.x-a.x:Math.max(.1,Math.abs(b.x-a.x)),height:line?b.y-a.y:Math.max(.1,Math.abs(b.y-a.y))});
      }
    });
    overlay.addEventListener('pointercancel',()=>{gesture=null;draw();});
    overlay.addEventListener('dblclick',event=>{const it=hit(coord(event));if(it?.type==='text'){select(it.key);onText(it);}});
    function setTool(value){tool=value;overlay.style.cursor=tool==='select'?'default':tool==='hand'?'grab':'crosshair';document.querySelectorAll('[data-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tool===value)));}
    return {
      update(next){data=next;overlay.dataset.documentId=next.documentId;overlay.dataset.revision=String(next.revision);items=next.objects.map(item);const key=selected?.key;selected=items.find(it=>it.key===key)||null;onSelection(selected);draw();},
      scale(value){zoom=value;draw();},select,setTool,
      get selected(){return selected;},get tool(){return tool;},get items(){return items;},
      cancel(){gesture=null;draw();},
    };
  }
  globalThis.SvgCanvas={setup,matrix,mul,point,inverse,geometryBounds};
})();
