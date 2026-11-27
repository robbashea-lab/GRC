import RegisterLoadError from './RegisterLoadError';
import {useBrawndoTheme} from '@/lib/brawndoTheme';

// Qualified route chrome can render before records; it never supplies record controls or counts.
export default function AdditionalPagePending({className,headerClassName='ba-page-head',title,subtitle,name,loadingMessage,error,onRetry}) {
  const [theme]=useBrawndoTheme();
  return <div className={`brawndo-additional ${className}`} data-theme={theme} data-presentation-state="pending" aria-busy={!error}>
    <header className={headerClassName}><div><h1>{title}</h1><p>{subtitle}</p></div></header>
    <div className="section-body">
      {error?<RegisterLoadError error={error} onRetry={onRetry} name={name}/>:<p role="status">{loadingMessage}</p>}
    </div>
  </div>;
}
