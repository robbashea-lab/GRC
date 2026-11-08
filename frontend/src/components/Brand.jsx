import feather from '@/assets/governara-feather.svg';
import './Brand.css';

export function BrandMark({className='brand-mark'}) {
  return <img className={'governara-feather '+className} src={feather} alt="" aria-hidden="true" draggable="false"/>;
}

// Application identity is intentionally static. Public recovery pages keep their
// existing Brand below; their presentation is outside this consistency pass.
export function ApplicationBrand({className='brand-lockup',markClassName='brand-mark'}) {
  return <div className={'application-brand '+className} aria-label="GoverNara">
    <BrandMark className={markClassName}/>
    <span><span className="application-brand-name">GoverNara</span><small className="application-brand-tagline">Turn complexity into clarity.</small></span>
  </div>;
}

export default function Brand() {
  return <div className="brand-lockup" aria-label="GoverNara by Prestige Worldwide"><BrandMark/><div><div className="brand-name">GoverNara</div><div className="brand-owner">BY PRESTIGE WORLDWIDE</div></div></div>;
}
