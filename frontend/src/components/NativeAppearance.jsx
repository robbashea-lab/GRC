import {useRef} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {appearances, setAppearance} from '@/lib/nativeAppearance';
import './NativeAppearance.css';

export default function NativeAppearance({choice, mode}) {
  const activeButton = useRef(null);
  const renderCard = option => (
    <button key={option.id} type="button" className="theme-gallery-card"
      ref={option.id === choice.id ? activeButton : null}
      data-gallery-theme={option.id} data-gallery-default={option.defaultMode || 'light'}
      aria-label={option.name + ', ' + option.description} aria-pressed={choice.id === option.id}
      onClick={() => setAppearance(option.id, option.id === choice.id ? mode : option.defaultMode)}>
      <span className="theme-gallery-mini" aria-hidden="true">
        <span className="mini-cap"/><span className="mini-side"/><span className="mini-sheet"/>
      </span>
      <span>{option.name}</span>
    </button>
  );

  return <Dialog.Root modal={false}>
    <Dialog.Trigger asChild>
      <button id="theme-gallery-trigger" type="button" aria-label={'Appearance. Current theme ' + choice.name}
        aria-controls="theme-gallery-panel" title="Appearance">
        <span className="theme-gallery-icon" aria-hidden="true"/><span className="theme-gallery-label">Appearance</span>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Content id="theme-gallery-panel" onOpenAutoFocus={event => {
        if (activeButton.current) { event.preventDefault(); activeButton.current.focus(); }
      }}>
        <header className="theme-gallery-head">
          <div><Dialog.Title>Choose a theme</Dialog.Title>
            <Dialog.Description aria-live="polite">{choice.description}</Dialog.Description></div>
          <div className="theme-gallery-modes" role="group" aria-label="Appearance mode">
            {['light', 'dark'].map(value => <button key={value} type="button" data-gallery-mode={value}
              aria-pressed={value === mode} disabled={!!choice.fixed} title={choice.fixed ? 'This theme has one appearance' : undefined}
              onClick={() => setAppearance(choice.id, value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}
          </div>
          <Dialog.Close asChild><button id="theme-gallery-close" type="button" aria-label="Close theme picker">×</button></Dialog.Close>
        </header>
        <div id="theme-gallery-options">
          <div className="theme-gallery-grid">{appearances.filter(option => !option.fixed).map(renderCard)}</div>
          <div className="theme-gallery-rule" aria-hidden="true"/>
          <div className="theme-gallery-grid">{appearances.filter(option => option.fixed).map(renderCard)}</div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
