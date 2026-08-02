/** iOS-style sliding toggle switch */
export default function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`switch ${value ? 'switch-on' : ''}`}
      onClick={e => { e.stopPropagation(); onChange(!value); }}
      role="switch"
      aria-checked={value}
    >
      <div className="switch-knob" />
    </div>
  );
}
