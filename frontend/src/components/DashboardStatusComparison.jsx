import {Link} from 'react-router-dom';
import './DashboardStatusComparison.css';

const colors = {addressed:'var(--s1)', in_progress:'var(--s2)', needs_attention:'var(--s3)', not_assessed:'var(--s4)'};

export default function DashboardStatusComparison({counts, total, unit, verb, hrefForStatus, onStatusNavigate, asOf}) {
  const implemented = counts.find(row => row.key === 'addressed').count;
  const assessed = total - counts.find(row => row.key === 'not_assessed').count;
  const share = count => total ? (100 * count / total).toFixed(1) + '%' : '—';
  return <div className="bf-bars"><div className="bfb-layout">
    <section className="bfb-summary">
      <div className="bfb-hero">
        <h3>{verb === 'addressed' ? 'Current readiness' : 'Current implementation'}</h3>
        <strong className="bfb-big">{share(implemented)}</strong>
        <p>{implemented} of {total} {unit} {verb}</p>
        {asOf && <small>As of {asOf}</small>}
      </div>
      <div className="bfb-coverage"><div><h3>Assessment coverage</h3><p>{assessed} of {total} assessed</p></div><strong>{share(assessed)}</strong></div>
    </section>
    <section className="bfb-comparison" aria-label="Status comparison">
      <h3>Status comparison</h3>
      <div className="bfb-head" aria-hidden="true"><span>Status</span><span className="bfb-ticks">{[0,25,50,75,100].map(tick =>
        <span key={tick} style={{'--tick':tick + '%'}}>{tick}%</span>)}</span><span>Share</span><span>Count</span></div>
      <div className="bfb-rows">{counts.map(({key, label = key.replaceAll('_', ' '), count}) => {
        const contents = <><span className="bfb-name">{label}</span>
          <span className="bfb-plot" aria-hidden="true"><span className="bfb-rail"/><span className="bfb-fill" style={{width:total ? share(count) : '0%', background:colors[key]}}/></span>
          <strong className="bfb-pct">{share(count)}</strong><span className="bfb-count">{count}</span></>;
        const accessibleName = `Open ${label.toLowerCase()} ${unit} (${count}, ${share(count)})`;
        return hrefForStatus ? <Link key={key} className="bfb-row" aria-label={accessibleName} to={hrefForStatus(key)}>{contents}</Link>
          : <button type="button" key={key} className="bfb-row" aria-label={accessibleName} onClick={() => onStatusNavigate(key)}>{contents}</button>;
      })}</div>
    </section>
  </div></div>;
}
