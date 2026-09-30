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
export async function exportElementToPNG(el: HTMLElement, filename: string): Promise<void> {
  try {
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
      onclone(clonedDoc: Document) {
        const UNSUPPORTED_COLOR_RE = /oklch\([^)]+\)|oklab\([^)]+\)|lch\([^)]+\)|lab\([^)]+\)|color-mix\([^)]+\)/gi;
        const FALLBACK = '#666';

        // 1. Convert <link> stylesheets to inline <style> so we can strip
        //    unsupported colors from their CSS text (Tailwind v4 loads via <link>).
        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link: Element) => {
          const l = link as HTMLLinkElement;
          try {
            const sheet = l.sheet;
            if (sheet && sheet.cssRules) {
              const css = Array.prototype.slice.call(sheet.cssRules)
                .map((r: CSSRule) => (r as CSSStyleRule).cssText || '')
                .join('\n');
              const style = clonedDoc.createElement('style');
              style.textContent = css.replace(UNSUPPORTED_COLOR_RE, FALLBACK);
              l.parentNode?.replaceChild(style, l);
            }
          } catch {
            // Cross-origin or inaccessible sheet — drop it so oklch() won't leak through
            l.parentNode?.removeChild(l);
          }
        });

        // 2. Strip unsupported colors from inline styles
        clonedDoc.querySelectorAll('*').forEach((elm: Element) => {
          const s = (elm as HTMLElement).style;
          for (let i = s.length - 1; i >= 0; i--) {
            if (UNSUPPORTED_COLOR_RE.test(s.getPropertyValue(s[i]))) s.removeProperty(s[i]);
          }
          if (elm.hasAttribute('style')) {
            const attr = elm.getAttribute('style') || '';
            const cleaned = attr.replace(UNSUPPORTED_COLOR_RE, FALLBACK);
            if (cleaned !== attr) elm.setAttribute('style', cleaned);
          }
        });

        // 3. Strip unsupported colors from <style> tag text
        clonedDoc.querySelectorAll('style').forEach((st: HTMLStyleElement) => {
          if (st.textContent) st.textContent = st.textContent.replace(UNSUPPORTED_COLOR_RE, FALLBACK);
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
      },
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
