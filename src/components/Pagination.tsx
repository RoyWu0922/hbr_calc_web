interface PaginationProps {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}

export default function Pagination({ page, pageCount, onPage }: PaginationProps) {
  if (pageCount <= 1) return null;

  const items: (number | '…')[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pageCount, page + 2);
  if (start > 1) items.push(1, '…');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < pageCount) items.push('…', pageCount);

  return (
    <div className="flex items-center justify-center gap-1 flex-wrap mt-4">
      <button className="btn btn-secondary btn-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ 上一页</button>
      {items.map((p, i) => p === '…' ? (
        <span key={`e${i}`} className="px-1 text-text-muted">…</span>
      ) : (
        <button key={p} className={`btn btn-xs ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onPage(p as number)}>{p}</button>
      ))}
      <button className="btn btn-secondary btn-xs" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>下一页 ›</button>
    </div>
  );
}
