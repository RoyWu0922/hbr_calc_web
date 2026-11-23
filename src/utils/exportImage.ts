/**
 * Export a DOM element to a PNG image, following the current app theme.
 *
 * Uses the bundled html2canvas v1.4.1 (src/utils/html2canvas.esm.js). That
 * version does NOT support the oklch()/oklab()/lch()/lab()/color-mix() color
 * functions that Tailwind v4 emits, so on clone we strip / replace those with
 * a neutral fallback — otherwise the export throws or renders wrong colors.
 *
 * backdrop-filter (glass blur) is also unsupported by html2canvas; exported
 * cards render with their solid rgba background over the theme body color.
 *
 * The clone's CSS comes from the LIVE document (collectLiveStyleText) injected
 * as one <style>: the cloned <link>s and the cloned head <style>s are removed and
 * replaced by it. It is deliberately
 * NOT read out of the clone's own stylesheet: the clone lives in a hidden
 * about:blank iframe that html2canvas fills via `document.open()/write()`, and
 * several engines (iOS Safari, the Android in-app WebViews that open shared
 * links) treat a stylesheet loaded into such a document as unreadable — reading
 * `link.sheet.cssRules` there throws SecurityError. The old code deleted that
 * link in its catch block, i.e. deleted the app's only stylesheet, and the PNG
 * came out as unstyled stacked text with nothing surviving but the JS-hardcoded
 * `rowBg` colours — a 简轴 image one column wide and taller than the screen,
 * which is the 「手机上导出轴图变成这样」 report. The live document's sheets are
 * loaded and same-origin by definition, so they read fine everywhere.
 *
 * Two more limitations worth knowing before you build an export target:
 *
 *   - `content: ""` pseudo-elements are NOT rendered. resolvePseudoContent()
 *     bails out when the parsed `content` value is falsy, which an empty
 *     string is, so the ::before/::after produces no paint box at all. The
 *     app's glass highlights (.card::before, .glass::before, …) are all
 *     `content: ""` and have always been silently dropped from exports —
 *     harmless for decoration, but a layout whose PRIMARY information lives
 *     in such a pseudo-element will export blank. Use a real DOM node.
 *   - flex/grid are not interpreted; geometry is read back via
 *     getBoundingClientRect() on the cloned tree. So grid columns, flex
 *     ratios and `gap: 1px` hairlines DO export correctly.
 */

/**
 * Color functions html2canvas v1.4.1 cannot parse. Note the pattern stops at
 * the first `)`, so `color-mix(in srgb, var(--x) calc(var(--card-opacity, 1) *
 * 100%), transparent)` is only partly matched — the leftover makes the
 * declaration invalid and the browser drops it, which is the intended neutral
 * fallback for a colour html2canvas cannot read anyway.
 */
const UNSUPPORTED_COLOR_SRC =
  'oklch\\([^)]+\\)|oklab\\([^)]+\\)|lch\\([^)]+\\)|lab\\([^)]+\\)|color-mix\\([^)]+\\)';
const UNSUPPORTED_COLOR_RE = new RegExp(UNSUPPORTED_COLOR_SRC, 'gi');
/**
 * Non-global twin for `.test()`. A /g regex keeps `lastIndex` between calls, so
 * testing one shared instance against a list of declarations skipped every
 * second match — some inline unsupported colours went through untouched.
 */
const UNSUPPORTED_COLOR_TEST = new RegExp(UNSUPPORTED_COLOR_SRC, 'i');
const FALLBACK = '#666';

const stripUnsupported = (css: string): string => css.replace(UNSUPPORTED_COLOR_RE, FALLBACK);
const isUnsupported = (value: string): boolean => UNSUPPORTED_COLOR_TEST.test(value);

/**
 * Serialize every readable rule of the LIVE document's stylesheets into one CSS
 * string. Call this BEFORE html2canvas clones anything.
 *
 * Cross-origin sheets (the Google Fonts <link> in index.html) throw on
 * `cssRules` — skip them. They were always absent from the export; the clone
 * used to just lose that link.
 */
export function collectLiveStyleText(doc: Document = document): string {
  const parts: string[] = [];
  const push = (sheet: CSSStyleSheet | null | undefined) => {
    if (!sheet) return;
    try {
      const rules = sheet.cssRules;
      if (!rules) return;
      for (let i = 0; i < rules.length; i++) {
        const text = rules[i]?.cssText;
        if (text) parts.push(text);
      }
    } catch {
      // Cross-origin or otherwise unreadable — nothing to copy.
    }
  };

  for (let i = 0; i < doc.styleSheets.length; i++) push(doc.styleSheets[i]);
  // Constructable sheets carry no <link>/<style> node, so they need their own pass.
  const adopted = (doc as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets;
  if (adopted) for (const sheet of Array.from(adopted)) push(sheet);

  return parts.join('\n');
}

/**
 * The whole clone-side fix-up, expressed as a function of the live CSS text so
 * it can also be driven without a real export (probe callers import it directly
 * instead of going through exportElementToPNG).
 */
export function buildClonePatcher(liveCss: string) {
  return (clonedDoc: Document): void => {
    // 1. Replace the clone's OWN stylesheet nodes with one <style> carrying the
    //    live CSS. See the file header: reading the clone's own `link.sheet` is
    //    what silently emptied the phone export, so nothing here depends on the
    //    clone having fetched — or being allowed to read — any sheet at all.
    //
    //    Every <link> and every head <style> goes — document.styleSheets
    //    enumerates <style> tags too, so whatever the clone kept there would be a
    //    second copy of rules already inside `liveCss`. Do not try to tell dev
    //    from prod by 「there is no <link>」 — index.html always carries the
    //    Google Fonts <link>, so dev has that link AND Vite's injected <style>.
    //
    //    The body is left alone, and that is the one exception: html2canvas
    //    injects its own pseudo-element-hiding sheet into the clone's BODY
    //    (createStyles(body, …), `.___html2canvas___pseudoelement_before/after`)
    //    before onclone runs, and that one is not part of `liveCss`. The sheet
    //    only matters for pseudo-elements with a non-empty `content`, which this
    //    app never writes (every `content: ""` is dropped by html2canvas anyway),
    //    but there is no reason to break it for a future caller.
    //
    //    Empty `liveCss` means every sheet was unreadable, and leaving the
    //    clone's own stylesheet is the only way to still render: deleting the
    //    app's only sheet in that state is the exact failure this fix removes.
    if (liveCss) {
      const style = clonedDoc.createElement('style');
      style.textContent = stripUnsupported(liveCss);
      const stale = [
        ...Array.from(clonedDoc.querySelectorAll('link[rel="stylesheet"]')),
        ...Array.from(clonedDoc.head.querySelectorAll('style')),
      ];
      const anchor = stale[0];
      if (anchor?.parentNode) anchor.parentNode.replaceChild(style, anchor);
      else clonedDoc.head.appendChild(style);
      for (const node of stale) node.parentNode?.removeChild(node);
    }

    // 1b. Pin relative url() resolution to the app's own base URL. The clone's
    //     document URL is about:blank, so a relative font/image URL inside the
    //     injected CSS would otherwise resolve against whatever the engine
    //     inherits — or not resolve at all.
    if (!clonedDoc.querySelector('base')) {
      const base = clonedDoc.createElement('base');
      base.setAttribute('href', document.baseURI);
      clonedDoc.head.insertBefore(base, clonedDoc.head.firstChild);
    }

    // 2. Strip unsupported colors from inline styles
    clonedDoc.querySelectorAll('*').forEach((elm: Element) => {
      const s = (elm as HTMLElement).style;
      for (let i = s.length - 1; i >= 0; i--) {
        if (isUnsupported(s.getPropertyValue(s[i]))) s.removeProperty(s[i]);
      }
      if (elm.hasAttribute('style')) {
        const attr = elm.getAttribute('style') || '';
        const cleaned = stripUnsupported(attr);
        if (cleaned !== attr) elm.setAttribute('style', cleaned);
      }
    });

    // 3. Strip unsupported colors from <style> tag text
    clonedDoc.querySelectorAll('style').forEach((st: HTMLStyleElement) => {
      if (st.textContent) st.textContent = stripUnsupported(st.textContent);
    });

    // 4. Keep table cells vertically centred. Guarded on a <table> actually
    //    being present so this doesn't leak into non-table export targets
    //    (e.g. MedalRecord).
    //
    //    This rule used to also force `line-height: 1.4` and 6px/3px padding
    //    on every cell. That was a workaround for html2canvas painting text
    //    ~6px below its own line box (the LOCAL PATCH in FontMetrics,
    //    html2canvas.esm.js): the extra padding bought the glyphs somewhere
    //    to fall. With the baseline fixed the workaround is not just
    //    redundant but harmful, because it relayed the table out inside the
    //    clone and the PNG stopped matching the screen. Measured on the 简轴
    //    表格 export: 30.5px rows in a 148px-tall image with the padding
    //    forced, 25.5px rows in a 119px image without it — and the live
    //    element is 119px. vertical-align stays: it is what puts the line box
    //    where the cell's middle is, and html2canvas reads that geometry back.
    if (clonedDoc.querySelector('table')) {
      const cellCss = clonedDoc.createElement('style');
      cellCss.textContent = [
        'td, th {',
        '  vertical-align: middle !important;',
        '}',
        'td > *, th > * { vertical-align: middle !important; }',
      ].join('\n');
      clonedDoc.head.appendChild(cellCss);
    }

    // 5. Expand a horizontally-scrollable export target to its full content
    //    width. overflow-x-auto makes html2canvas render only the visible
    //    box, so anything past the right edge gets clipped — the root cause
    //    of "the exported image only shows part of the table".
    //
    //    content-box because `scrollWidth` measures the CONTENT, while the
    //    app styles this element with border-box: assigning to border-box
    //    spends the 1px borders (±2px) out of the content, so the content
    //    that was supposed to fit exactly overflowed by exactly that much.
    //    Measured on the 角色泳道 axle: the last round column's right grid
    //    line came out as page background instead of the line — the content
    //    box was 2px narrower than the grid it was sized for. With the box
    //    model corrected the canvas is 888 → 890 and the line is painted.
    const tl = clonedDoc.querySelector('[data-timeline-export]') as HTMLElement | null;
    if (tl) {
      const fullWidth = tl.scrollWidth;
      tl.style.overflow = 'visible';
      tl.style.boxSizing = 'content-box';
      tl.style.width = `${fullWidth}px`;
    }

    // 6. Freeze CSS animations on the clone. html2canvas kills transitions
    //    (you can see the injected `transition-property: none`) but NOT
    //    animations, so a cloned element replays them from the start and
    //    html2canvas samples whatever frame the capture lands on. `.card`
    //    is `animation: cardIn 0.4s ease both`, whose keyframes run
    //    opacity 0 → 1, so an export rooted on a .card came out washed out
    //    at a run-to-run varying alpha (~0.5) instead of what's on screen.
    //    Killing the animation leaves the element at its base style, which
    //    is the settled state the user actually sees.
    const animCss = clonedDoc.createElement('style');
    animCss.textContent = '*, *::before, *::after { animation: none !important; }';
    clonedDoc.head.appendChild(animCss);
  };
}

export async function exportElementToPNG(el: HTMLElement, filename: string): Promise<void> {
  try {
    // Read the CSS while we are still on the live document — the clone cannot
    // be trusted to have a readable stylesheet (see the file header).
    const liveCss = collectLiveStyleText();
    const html2canvas = (await import('./html2canvas.esm.js')).default;
    const canvas = await html2canvas(el, {
      // Match the current app theme (dark/light), not a forced light background
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      // Transposed / scrollable targets (e.g. the 角色泳道 chart) can be several
      // thousand px wide; at scale 2 that blows past the browser canvas limit
      // and the export comes out blank. Drop to 1x once content gets that wide.
      scale: el.scrollWidth > 3000 ? 1 : 2,
      useCORS: true,
      logging: false,
      // Render SVG arcs (RankArc / PctRing) accurately via foreignObject;
      // v1.4.1's DOM fallback mis-handles var() strokes + rotate/strokeDasharray
      svgRendering: true,
      // Do not clone subtrees the browser is not painting anyway.
      //
      // App.tsx keeps every page mounted behind `display: none` so a tab switch
      // does not lose state, and the planner itself hides whole sub-tables the
      // same way. html2canvas clones the ENTIRE document and computes styles for
      // every element in the clone before drawing only the target subtree, so
      // those hidden pages dominated the export: on the 简轴 export the document
      // is 3,720 elements against 124 inside the target, and a CPU profile put
      // 70% of the wall time in that per-element style work (getPropertyValue /
      // CSSStyleDeclaration.item / setProperty). Skipping them takes a 2x export
      // from ~1048ms to ~146ms with pixel-identical output (0 of 910,800 pixels
      // differ), because display:none never participates in layout — the
      // exported frame cannot shift.
      //
      // Checked against the inline `style` App.tsx writes and Tailwind's
      // `.hidden`; both are the same "not rendered" fact, so neither is a
      // heuristic that could hide something a user expects in the PNG.
      ignoreElements(node: Element) {
        if (!(node instanceof HTMLElement)) return false;
        if (node.style?.display === 'none') return true;
        return node.classList.contains('hidden');
      },
      onclone: buildClonePatcher(liveCss),
    });
    canvas.toBlob((blob: Blob | null) => {
      if (!blob) { alert('生成图片失败'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  } catch (e) {
    alert('导出失败: ' + (e instanceof Error ? e.message : String(e)));
  }
}
