export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="px-8 pt-8 pb-4 border-b border-line bg-surface-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-help mb-1">GRC Console</div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-primary font-heading">{title}</h1>
          {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
