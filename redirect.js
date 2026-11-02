/* Root and 404 redirect (spec 2.1, 2.1.1). An external file so a strict CSP needs no inline script. Shared by
   dist/index.html (the root) and dist/404.html (unknown paths on static hosts). Mirrors src/lib/langs.ts. */
(function () {
  'use strict';
  var LANGS = ['en', 'hi', 'mai', 'bn'];
  var ALIASES = {
    en: 'en',
    hi: 'hi',
    mai: 'mai',
    bn: 'bn',
    english: 'en',
    hindi: 'hi',
    maithili: 'mai',
    bangla: 'bn',
    bengali: 'bn',
    'हिन्दी': 'hi',
    'हिंदी': 'hi',
    'मैथिली': 'mai',
    'বাংলা': 'bn',
    'বাঙলা': 'bn',
  };
  // the variant pages /{lang}/b/, /k/, /bk/ (src/lib/langs.ts VARIANT_SLUGS): kept when the path only had the wrong
  // letter case or extra segments
  var SLUGS = { b: 'b', k: 'k', bk: 'bk', kb: 'bk' };
  var script = document.currentScript;
  var base = (script && script.getAttribute('data-base')) || '/';

  function stored() {
    try {
      return window.localStorage.getItem('asw.lang');
    } catch {
      return null;
    }
  }

  function detect() {
    var s = stored();
    if (s && LANGS.indexOf(s) !== -1) return s;
    var list = (
      navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']
    ).map(function (l) {
      return String(l).toLowerCase().split(/[-_]/)[0];
    });
    for (var i = 0; i < list.length; i++) {
      if (list[i] === 'hi' && list.indexOf('mai') !== -1) return 'mai';
      if (LANGS.indexOf(list[i]) !== -1) return list[i];
    }
    return 'en';
  }

  var path = location.pathname;
  path = path.indexOf(base) === 0 ? path.slice(base.length) : path.replace(/^\//, '');
  var segments = path.split('/').filter(Boolean);
  var lang;
  var target = '';
  if (segments.length === 0) lang = detect();
  else {
    var seg = segments[0];
    try {
      seg = decodeURIComponent(seg);
    } catch {
      /* keep raw */
    }
    lang = ALIASES[seg.toLowerCase()] || ALIASES[seg] || 'en';
    var slug = ALIASES[seg.toLowerCase()] || ALIASES[seg] ? SLUGS[String(segments[1] || '').toLowerCase()] : '';
    target = lang + '/' + (slug ? slug + '/' : '');
    // never loop: the canonical page itself is a file; if a host served this page for it, show the links instead
    if (path === target) return;
  }
  location.replace(base + (target || lang + '/') + location.search + location.hash);
})();
