import {BookOpen, CalendarClock, ChevronDown, ExternalLink} from 'lucide-react';

function safeSource(source) {
  const value = typeof source === 'string' ? source : source?.url;
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
}
function triggerText(trigger, highlight) {
  const at = highlight ? trigger.indexOf(highlight) : -1;
  return at < 0 ? trigger : <>{trigger.slice(0, at)}<mark>{highlight}</mark>{trigger.slice(at + highlight.length)}</>;
}

export default function AssessmentRequirementDisclosure({frameworkLabel, reference, text,
  trigger, source, highlight, detailsClassName=''}) {
  const url = safeSource(source);
  return <section className="cis-native-requirement">
    <details className={`cis-collapsible-requirement gn-requirement ${detailsClassName}`.trim()}>
      <summary><span className="gn-summary-left"><BookOpen className="gn-icon" aria-hidden="true"/>
        What {frameworkLabel} requires <span className="gn-summary-ref">{reference}</span>
      </span><ChevronDown className="gn-icon gn-chevron" aria-hidden="true"/></summary>
      <div className="gn-requirement-copy">{text}</div>
      {(trigger || url) && <div className="cis-native-requirement-meta gn-requirement-foot">
        {trigger && <div className="gn-trigger"><CalendarClock className="gn-icon" aria-hidden="true"/>
          <p><span className="gn-trigger-label">Required operation / trigger</span>{triggerText(trigger, highlight)}</p>
        </div>}
        {url && <a className="gn-source" href={url} target="_blank" rel="noopener noreferrer">
          {typeof source === 'object' && source.label ? source.label : 'Source'}
          <ExternalLink className="gn-icon" aria-hidden="true"/>
        </a>}
      </div>}
    </details>
  </section>;
}
