export default function SimplePlannerPage() {
  const src = location.origin + import.meta.env.BASE_URL + 'TL.xlsx';
  const url = 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(src);
  return (
    <div className="space-y-3" style={{ height: 'calc(100vh - 80px)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">简轴</h2>
        <a href="/TL.xlsx" className="btn btn-secondary btn-xs" download>下载 TL.xlsx</a>
      </div>
      <iframe src={url} className="w-full rounded-lg border border-white/10" style={{ height: 'calc(100% - 40px)' }} />
    </div>
  );
}
