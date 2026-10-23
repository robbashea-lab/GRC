import {useState} from 'react';
import {Building2, Cpu} from 'lucide-react';
import './RegisterIdentityLogo.css';

// Callers resolve catalog identity and pass only an allowlisted native asset.
export default function RegisterIdentityLogo({kind, src, className = ''}) {
  const [imageState, setImageState] = useState({src: null, status: 'loading'});
  const status = imageState.src === src ? imageState.status : 'loading';
  const hasImage = typeof src === 'string' && src !== '' && status !== 'failed';
  const Icon = kind === 'vendor' ? Building2 : Cpu;

  return <span className={`register-identity-logo${className ? ` ${className}` : ''}`} aria-hidden="true">
    {(!hasImage || status !== 'loaded') && <Icon className="register-identity-logo__fallback" size={20} aria-hidden="true" focusable="false"/>}
    {hasImage && <img key={src} src={src} alt="" draggable="false"
      className={`register-identity-logo__image${status !== 'loaded' ? ' register-identity-logo__image--loading' : ''}`}
      onLoad={() => setImageState({src, status: 'loaded'})}
      onError={() => setImageState({src, status: 'failed'})}/>}
  </span>;
}
