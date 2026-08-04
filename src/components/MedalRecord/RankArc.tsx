interface RankArcProps {
  rank: number;
  isMax: boolean;
  into: number;
  span: number;
  size?: number;
}

export default function RankArc({ rank, isMax, into, span, size = 64 }: RankArcProps) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = isMax ? 1 : Math.min(1, Math.max(0, into / span));
  return (
    <div className="rank-arc" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.15)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--color-accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="rank-arc-label">
        <span className="rank-arc-rank">{isMax ? 'MAX' : `R${rank}`}</span>
      </div>
    </div>
  );
}
