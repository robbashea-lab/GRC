import feather from '@/assets/governara-feather.svg';
import './Brand.css';

export function BrandMark({className='brand-mark'}) {
  return <img className={'governara-feather '+className} src={feather} alt="" aria-hidden="true" draggable="false"/>;
}

export default function Brand() {
  return <div className="brand-lockup" aria-label="GoverNara by Prestige Worldwide"><BrandMark/><div><div className="brand-name">GoverNara</div><div className="brand-owner">BY PRESTIGE WORLDWIDE</div></div></div>;
}
