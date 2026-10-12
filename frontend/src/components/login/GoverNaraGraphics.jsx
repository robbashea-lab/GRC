// Exact SVG shapes from the approved public Login mockup; IDs stay route-local.
export function GoverNaraIcon({ name, className = "icon" }) {
  return <svg className={className} aria-hidden="true"><use href={`#governara-${name}`} /></svg>;
}

export default function GoverNaraGraphics() {
  return <svg className="sprite" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>
    <linearGradient id="governara-feather-gradient" x1="0" x2="1" y1="1" y2="0">
      <stop stopColor="#73b8fb" /><stop offset=".47" stopColor="#a4a2fc" /><stop offset=".8" stopColor="#d2e4ff" /><stop offset="1" stopColor="#fff" />
    </linearGradient>
    <symbol id="governara-feather" viewBox="0 0 54 56"><path fill="url(#governara-feather-gradient)" d="M9 44C21 40 40 36 49 20C47 33 35 43 19 46C31 46 40 43 45 39C38 48 25 51 13 47C23 52 31 53 39 50C26 58 12 51 7 43C2 34 3 24 7 18C4 30 7 36 11 38C11 29 19 23 28 20C39 16 46 9 52 2C50 20 35 29 19 34C12 37 9 41 9 44Z" /><path d="M6 43C6 36 17 31 28 25" fill="none" stroke="#a7ddff" strokeWidth="1" opacity=".55" /></symbol>
    <symbol id="governara-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5" /></symbol>
    <symbol id="governara-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
    <symbol id="governara-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></symbol>
    <symbol id="governara-mail" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="m4 6 8 6 8-6" /></symbol>
    <symbol id="governara-lock" viewBox="0 0 24 24"><rect x="4.5" y="10" width="15" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></symbol>
    <symbol id="governara-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></symbol>
    <symbol id="governara-eye-off" viewBox="0 0 24 24"><path d="m3 3 18 18M9.8 6.2A12.3 12.3 0 0 1 12 6c6.5 0 10 6 10 6a16.7 16.7 0 0 1-4 4.1M6.2 7.8A17 17 0 0 0 2 12s3.5 6 10 6c1.2 0 2.4-.2 3.5-.6M10 10a3 3 0 0 0 4 4" /></symbol>
    <symbol id="governara-bars" viewBox="0 0 24 24"><path d="M4 14h3v7H4zm6-6h3v13h-3zm6-5h3v18h-3z" /></symbol>
    <symbol id="governara-governance" viewBox="0 0 24 24"><path d="m3 8 9-5 9 5M3 9h18M5 10v8m5-8v8m4-8v8m5-8v8M3 19h18M2 22h20" /></symbol>
    <symbol id="governara-risk" viewBox="0 0 24 24"><path d="m3 18 6-7 4 3 8-10M15 4h6v6M3 22h18" /></symbol>
    <symbol id="governara-compliance" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="19" rx="2" /><path d="M9 2h6v4H9zm0 10 2 2 4-4m-6 8h6" /></symbol>
  </defs></svg>;
}
