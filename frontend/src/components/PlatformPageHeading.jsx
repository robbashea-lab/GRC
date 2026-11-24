export default function PlatformPageHeading({title, subtitle, action, eyebrow = 'Administration'}) {
  return <header className="page-head platform-page-head">
    <div className="platform-page-heading-copy">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <div className="page-sub grad">{subtitle}</div>}
    </div>
    {action}
  </header>;
}
