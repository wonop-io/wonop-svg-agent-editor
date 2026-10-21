// Run in the same browser engine as the package, passing SvgPreview.validate.
globalThis.runSvgPreviewChecks = function (validate) {
  const results = [];
  function check(value, name) { if (!value) throw new Error(name); results.push(name); }
  const plain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><text>Service → Mémoire 🦊</text></svg>';
  const parsed = validate(plain);
  check(!!parsed.url && !parsed.external, 'Namespace URL is not an external resource');
  check(decodeURIComponent(parsed.url.split(',').slice(1).join(',')) === plain, 'Preview preserves Unicode source');
  check(parsed.width === 1600 && parsed.height === 1000, 'Architecture viewBox dimensions');
  check(!validate('<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:url("#paint")}</style><use href="#node"/></svg>').external, 'Local fragments are self-contained');
  check(validate('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/image.png"/></svg>').external, 'External image reference identified');
  check(validate('<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://example.com/style.css";</style></svg>').external, 'External stylesheet identified');
  check(!validate('<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,eA=="/></svg>').external, 'Inline resource permitted');
  check(!!validate('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>').error, 'DTD and entities refused before parsing');
  check(!!validate('<svg/>').error && !!validate('<html/>').error, 'Root and namespace validation');
  check(!!validate('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>').error, 'Malformed XML feedback');
  check(!!validate('x'.repeat(200001)).error, 'Preview file-size limit');
  return results;
};
