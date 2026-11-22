/**
 * Unit coverage for the PNG-export clone patcher.
 *
 * There is no jsdom in this project, so the DOM here is a deliberately tiny
 * fake: it implements only the handful of members `buildClonePatcher` and
 * `collectLiveStyleText` actually touch (`createElement`, `head`, `querySelector`,
 * `querySelectorAll`, `setAttribute`, child-list surgery, and an array-like
 * `style`). `matches()` throws on a selector it does not know, so a new selector
 * in the implementation fails loudly instead of silently matching nothing.
 *
 * What these pin (both findings from the first review round):
 *   - the clone's own <link>s AND <style>s are replaced by ONE injected sheet,
 *     regardless of whether the document also carries the Google Fonts <link>
 *   - an empty live CSS leaves the clone's stylesheets alone — deleting the
 *     app's only sheet is the bug this whole file exists to prevent
 *   - <base href> is added once, and not twice
 *   - two consecutive unsupported inline colours are both dropped (the /g
 *     regex + .test() lastIndex bug)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildClonePatcher, collectLiveStyleText } from './exportImage';

// ─── fake DOM ────────────────────────────────────────────────────────────────

interface FakeStyle {
  length: number;
  [index: number]: string;
  getPropertyValue(name: string): string;
  removeProperty(name: string): void;
  removed: string[];
}

/** Array-like CSSStyleDeclaration: `s[i]` yields a name, getPropertyValue its value. */
function fakeStyle(entries: [name: string, value: string][] = []): FakeStyle {
  const removed: string[] = [];
  const style = {
    length: entries.length,
    removed,
    getPropertyValue(name: string) {
      return entries.find(([n]) => n === name)?.[1] ?? '';
    },
    removeProperty(name: string) {
      removed.push(name);
    },
  } as FakeStyle;
  entries.forEach(([name], i) => { (style as unknown as Record<number, string>)[i] = name; });
  return style;
}

const SELECTORS = new Set([
  '*', 'style', 'table', 'base', 'link[rel="stylesheet"]', '[data-timeline-export]',
]);

function matches(el: FakeElement, selector: string): boolean {
  return selector.split(',').map(s => s.trim()).some(one => {
    if (!SELECTORS.has(one)) throw new Error(`fake DOM has no matcher for selector: ${one}`);
    if (one === '*') return true;
    if (one === 'style') return el.tag === 'style';
    if (one === 'table') return el.tag === 'table';
    if (one === 'base') return el.tag === 'base';
    if (one === '[data-timeline-export]') return 'data-timeline-export' in el.attrs;
    return el.tag === 'link' && el.attrs.rel === 'stylesheet';
  });
}

class FakeElement {
  tag: string;
  attrs: Record<string, string>;
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  textContent = '';
  style: FakeStyle;

  constructor(tag: string, attrs: Record<string, string> = {}, styleEntries: [string, string][] = []) {
    this.tag = tag;
    this.attrs = { ...attrs };
    this.style = fakeStyle(styleEntries);
  }

  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  getAttribute(name: string) { return name in this.attrs ? this.attrs[name] : null; }
  hasAttribute(name: string) { return name in this.attrs; }

  appendChild(node: FakeElement) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  insertBefore(node: FakeElement, ref: FakeElement | null) {
    node.parentNode = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.unshift(node);
    else this.children.splice(at, 0, node);
    return node;
  }

  replaceChild(node: FakeElement, old: FakeElement) {
    const at = this.children.indexOf(old);
    node.parentNode = this;
    if (at < 0) this.children.push(node);
    else this.children[at] = node;
    old.parentNode = null;
    return old;
  }

  removeChild(node: FakeElement) {
    const at = this.children.indexOf(node);
    if (at >= 0) this.children.splice(at, 1);
    node.parentNode = null;
    return node;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return descendants(this).filter(el => matches(el, selector));
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return root.children.flatMap(child => [child, ...descendants(child)]);
}

class FakeDocument {
  root = new FakeElement('html');
  head = this.root.appendChild(new FakeElement('head'));
  body = this.root.appendChild(new FakeElement('body'));
  baseURI = 'https://example.test/planner/axle';

  createElement(tag: string) { return new FakeElement(tag); }
  querySelectorAll(selector: string) { return this.root.querySelectorAll(selector); }
  querySelector(selector: string) { return this.root.querySelector(selector); }
}

/** The real patcher reads `document.baseURI`, so stub the global for the duration. */
const REAL_DOCUMENT = (globalThis as { document?: unknown }).document;
afterEach(() => {
  (globalThis as { document?: unknown }).document = REAL_DOCUMENT;
});

function useFakeGlobalDocument(baseURI: string): void {
  (globalThis as { document?: unknown }).document = { baseURI };
}

const asDoc = (doc: FakeDocument) => doc as unknown as Document;

// ─── collectLiveStyleText ────────────────────────────────────────────────────

describe('collectLiveStyleText', () => {
  it('keeps readable rules and skips a cross-origin sheet that throws', () => {
    const readable = { cssRules: [{ cssText: 'a{color:red}' }, { cssText: 'b{color:blue}' }] };
    const crossOrigin = Object.defineProperty({}, 'cssRules', {
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
    const doc = { styleSheets: [readable, crossOrigin] } as unknown as Document;
    expect(collectLiveStyleText(doc)).toBe('a{color:red}\nb{color:blue}');
  });

  it('returns an empty string when nothing is readable', () => {
    const crossOrigin = Object.defineProperty({}, 'cssRules', {
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
    const doc = { styleSheets: [crossOrigin] } as unknown as Document;
    expect(collectLiveStyleText(doc)).toBe('');
  });
});

// ─── buildClonePatcher: stylesheet replacement ───────────────────────────────

function cloneWithDocs() {
  const doc = new FakeDocument();
  doc.head.appendChild(new FakeElement('link', { rel: 'stylesheet', href: '/assets/app.css' }));
  doc.head.appendChild(new FakeElement('link', { rel: 'stylesheet', href: 'https://fonts.example/x.css' }));
  doc.head.appendChild(new FakeElement('style'));
  const body = doc.body.appendChild(new FakeElement('div'));
  return { doc, body };
}

describe('buildClonePatcher stylesheets', () => {
  it('drops every cloned <link> and <style> and injects one stripped sheet', () => {
    useFakeGlobalDocument('https://example.test/planner/axle');
    const { doc } = cloneWithDocs();
    buildClonePatcher('a{color:oklch(0.5 0 0)}b{color:red}')(asDoc(doc));

    expect(doc.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(0);
    // the injected sheet + the animation-killer; nothing carried over
    const styles = doc.querySelectorAll('style');
    expect(styles).toHaveLength(2);
    expect(styles[0].textContent).toBe('a{color:#666}b{color:red}');
    expect(styles[1].textContent).toContain('animation: none');
  });

  it('keeps the pseudo-element style html2canvas injects into the clone body', () => {
    // html2canvas runs createStyles(body, …) BEFORE onclone: that sheet hides the
    // real ::before/::after of elements it faked a node for. It is not part of
    // liveCss, and deleting it would double-paint such a pseudo-element — the
    // app writes none today, so this is a guard, not a live path.
    useFakeGlobalDocument('https://example.test/planner/axle');
    const { doc } = cloneWithDocs();
    const pseudoSheet = doc.body.appendChild(new FakeElement('style'));
    pseudoSheet.textContent = '.___html2canvas___pseudoelement_before:before { content: "" !important; }';

    buildClonePatcher('a{color:red}')(asDoc(doc));

    expect(doc.querySelectorAll('style').map(s => s.textContent)).toContain(
      '.___html2canvas___pseudoelement_before:before { content: "" !important; }',
    );
    // …while the head's copy is gone: injected sheet + animation-killer only
    expect(doc.head.querySelectorAll('style')).toHaveLength(2);
  });

  it('leaves the clone stylesheets alone when the live CSS is empty', () => {
    useFakeGlobalDocument('https://example.test/planner/axle');
    const { doc } = cloneWithDocs();
    buildClonePatcher('')(asDoc(doc));

    expect(doc.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(2);
    // the original <style> + the animation-killer, and no injected copy
    expect(doc.querySelectorAll('style')).toHaveLength(2);
  });

  it('adds <base href> exactly once, even if the patcher runs twice', () => {
    useFakeGlobalDocument('https://example.test/planner/axle');
    const { doc } = cloneWithDocs();
    const patch = buildClonePatcher('a{color:red}');
    patch(asDoc(doc));
    patch(asDoc(doc));

    const bases = doc.querySelectorAll('base');
    expect(bases).toHaveLength(1);
    expect(bases[0].getAttribute('href')).toBe('https://example.test/planner/axle');
  });
});

// ─── buildClonePatcher: inline colour stripping ─────────────────────────────

describe('buildClonePatcher inline styles', () => {
  it('strips unsupported colours from two consecutive elements', () => {
    // The /g regex used with .test() kept lastIndex between calls and skipped
    // every second match, so the second element's property survived.
    useFakeGlobalDocument('https://example.test/planner/axle');
    const { doc } = cloneWithDocs();
    const first = doc.body.appendChild(new FakeElement('span', {}, [['color', 'oklch(0.5 0 0)']]));
    const second = doc.body.appendChild(new FakeElement('span', {}, [['color', 'color-mix(in srgb, red, blue)']]));

    buildClonePatcher('a{color:red}')(asDoc(doc));

    expect(first.style.removed).toEqual(['color']);
    expect(second.style.removed).toEqual(['color']);
  });

  it('also stamps the fallback into an inline style attribute', () => {
    useFakeGlobalDocument('https://example.test/planner/axle');
    const { doc } = cloneWithDocs();
    const el = doc.body.appendChild(new FakeElement('span', { style: 'color: oklch(0.5 0 0)' }));

    buildClonePatcher('a{color:red}')(asDoc(doc));

    expect(el.getAttribute('style')).toBe('color: #666');
  });
});
