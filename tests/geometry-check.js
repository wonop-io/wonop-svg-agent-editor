// Read-only native WebKit checks: no document commands, gestures or source writes.
globalThis.runSvgGeometryChecks = function () {
  const results = [];
  function box(type, value, expected, name) {
    const actual = SvgCanvas.geometryBounds(type, value);
    if (!actual || ['x','y','w','h'].some(k => Math.abs(actual[k]-expected[k]) > .01)) throw new Error(name + ': ' + JSON.stringify(actual));
    results.push(name);
  }
  box('path','M0 0C0 100 100 100 100 0',{x:0,y:0,w:100,h:75},'Bezier selection uses native curve extrema, not control-point pairs');
  box('path','M10 20a30 10 0 0 1 60 0',{x:10,y:10,w:60,h:10},'Relative arc selection uses native SVG bounds');
  box('polyline','-10,5 20,15 4,-5',{x:-10,y:-5,w:30,h:20},'Polyline bounds preserve negative coordinates');
  const m = SvgCanvas.matrix('translate(100 50) rotate(90 10 20) scale(2 3)');
  const p = SvgCanvas.point(m,{x:3,y:4}), back = SvgCanvas.point(SvgCanvas.inverse(m),p);
  if(Math.abs(p.x-118)>.001 || Math.abs(p.y-66)>.001 || Math.abs(back.x-3)>.001 || Math.abs(back.y-4)>.001) throw new Error('Transform round trip');
  results.push('Native SVG transform order and inverse manipulation coordinates');
  if(SvgCanvas.geometryBounds('path','M0 0"><script>alert(1)</script>')!==null) throw new Error('Malformed path accepted');
  results.push('Markup is refused by the geometry parser');
  return {ok:true,results};
};
