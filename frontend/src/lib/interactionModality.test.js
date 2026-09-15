import { installInteractionModality } from './interactionModality';

test('keyboard feedback is the safe default and pointer/keyboard input changes only presentation state', () => {
  const cleanup = installInteractionModality();
  expect(document.documentElement.dataset.inputModality).toBe('keyboard');
  document.dispatchEvent(new Event('pointerdown'));
  expect(document.documentElement.dataset.inputModality).toBe('pointer');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(document.documentElement.dataset.inputModality).toBe('keyboard');
  cleanup();
  document.dispatchEvent(new Event('pointerdown'));
  expect(document.documentElement.dataset.inputModality).toBeUndefined();
});

test('system shortcuts do not switch presentation modality', () => {
  const cleanup = installInteractionModality();
  document.dispatchEvent(new Event('pointerdown'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
  expect(document.documentElement.dataset.inputModality).toBe('pointer');
  cleanup();
});
