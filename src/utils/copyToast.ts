// Simple global toast for clipboard copy feedback

let showToast: (() => void) | null = null;

export function setToastHandler(fn: () => void) {
  showToast = fn;
}

export function copyToClipboard(text: string) {
  const clean = String(text).replace(/%/g, '').replace(/,/g, '');
  try {
    navigator.clipboard.writeText(clean).then(() => {
      showToast?.();
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = clean; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast?.();
    });
  } catch { /* ignore */ }
}
