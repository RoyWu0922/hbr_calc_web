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
 */
export async function exportElementToPNG(el: HTMLElement, filename: string): Promise<void> {
  try {
    const html2canvas = (await import('./html2canvas.esm.js')).default;
    const canvas = await html2canvas(el, {
      // Match the current app theme (dark/light), not a forced light background
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      scale: 2,
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
