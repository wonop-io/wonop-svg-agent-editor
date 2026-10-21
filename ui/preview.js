// No untrusted markup enters the live DOM. The returned data URL is IMG-only.
(function () {
  'use strict';
  function validate(source) {
    if (new TextEncoder().encode(source).length > 200000) return { error: 'SVG exceeds 200 KB. Reduce the source size before previewing or saving.' };
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) return { error: 'DTDs and entities are not previewed. Remove the DOCTYPE/entity declaration and use inline SVG.' };
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const error = doc.querySelector('parsererror');
    if (error) {
      const message = error.textContent.replace(/\s+/g, ' ').trim();
      const match = message.match(/line\s+(\d+)(?:\s+at)?\s+(?:column|col)\s+(\d+)/i);
      return { error: message.slice(0, 500), line: match ? +match[1] : null, column: match ? +match[2] : null };
    }
    const root = doc.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') return { error: 'The root must be <svg xmlns="http://www.w3.org/2000/svg">. Add the SVG namespace.' };
    const box = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    let width = parseFloat(root.getAttribute('width')), height = parseFloat(root.getAttribute('height'));
    if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) [width, height] = box.slice(2);
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) [width, height] = [800, 500];
    const shrink = Math.min(1, 20000 / Math.max(width, height));
    width = Math.max(1, width * shrink); height = Math.max(1, height * shrink);
    // Namespace declarations name vocabularies, not resources. Inspect links/CSS only.
    const external = Array.from(doc.querySelectorAll('*')).some(element =>
      Array.from(element.attributes).some(attr => ['href', 'src'].includes(attr.localName) && !/^(?:#|data:|$)/i.test(attr.value.trim()))
    ) || /<\?xml-stylesheet/i.test(source) || Array.from(doc.querySelectorAll('*')).some(element => {
      const css = (element.localName === 'style' ? element.textContent : '') + (element.getAttribute('style') || '');
      return /@import/i.test(css) || Array.from(css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)).some(match => !/^(?:#|data:|$)/i.test(match[2].trim()));
    });
    return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source), width, height, external };
  }
  globalThis.SvgPreview = { validate };
})();
