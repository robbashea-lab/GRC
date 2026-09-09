export default function PageHeader({ title, subtitle, action, eyebrow }) {
  return (
    <div className="page-header">
      <div className="page-header-content">
        <div>
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
