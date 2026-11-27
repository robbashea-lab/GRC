// Interview reports describe reported practices; verification remains a native, independent conclusion.
export const inlineSentence=fragment=>/[.!?]$/.test(fragment)?fragment:fragment+'.';

export function formatInlineSummary({paragraph,controls=[],limitations='',date=new Date()}) {
  const assessed=date instanceof Date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`:date.slice(0,10);
  const text=[paragraph.trim(),limitations.trim(),`This assessment reflects practices reported on ${assessed}; independent verification remains separate.`].filter(Boolean).join(' ');
  const supported=[...new Set(controls.map(control=>control.trim()).filter(Boolean))];
  return supported.length?`${text}\n\nControls in place\n${supported.map(control=>'• '+control).join('\n')}`:text;
}
