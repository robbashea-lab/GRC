// Presentation only: keyboard work is immediate; pointer feedback is opt-in.
// No account, workspace, or persistent state is involved.
export function installInteractionModality(doc = document) {
  const setKeyboard = event => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) doc.documentElement.dataset.inputModality = 'keyboard';
  };
  const setPointer = () => { doc.documentElement.dataset.inputModality = 'pointer'; };
  doc.documentElement.dataset.inputModality = 'keyboard';
  doc.addEventListener('keydown', setKeyboard, true);
  doc.addEventListener('pointerdown', setPointer, true);
  return () => {
    doc.removeEventListener('keydown', setKeyboard, true);
    doc.removeEventListener('pointerdown', setPointer, true);
    delete doc.documentElement.dataset.inputModality;
  };
}
