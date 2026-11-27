export function approvedPortfolioDestination(mode) {
  const existing = document.cookie.split(';').some(value =>
    value.trim() === 'governara_staging_workspace=existing');
  if (process.env.REACT_APP_STANDARD_SIGN_IN !== 'true' || existing) return null;
  return mode === 'demo' ? '/visual-preview.html' : '/clients';
}
