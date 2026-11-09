import {useId, useState} from 'react';
import {Textarea} from './ui/textarea';

const OTHER = '__other__';

export default function AssessmentToolField({value = '', onChange, disabled = false,
  label = 'Tool or location', descriptionId, options = [], manualOnly = false}) {
  const fieldId = useId();
  const answer = typeof value === 'string' ? value : '';
  const selected = options.find(option => option.label === answer);
  const unlisted = answer !== '' && !selected && answer !== 'Not sure';
  const [custom, setCustom] = useState(() => unlisted ? answer : '');
  const [otherSelection, setOtherSelection] = useState(null);
  const showOther = unlisted || otherSelection === answer;
  const describedBy = [descriptionId, fieldId + '-help'].filter(Boolean).join(' ');
  const textOnly = manualOnly || options.length === 0;

  function selectTool(event) {
    if (disabled) return;
    const next = event.target.value;
    if (next === OTHER) {
      const restored = showOther ? answer : custom;
      setOtherSelection(restored);
      onChange(restored);
      return;
    }
    if (showOther) setCustom(answer);
    setOtherSelection(null);
    onChange(next);
  }
  function changeText(event) {
    if (disabled) return;
    const next = event.target.value;
    setCustom(next);
    setOtherSelection(next);
    onChange(next);
  }

  return <div className="brawndo-pilot-tool-field">
    <label htmlFor={fieldId}>{label}</label>
    {textOnly ? <Textarea id={fieldId} value={answer} onChange={changeText}
      maxLength={2000} disabled={disabled} aria-describedby={describedBy}/>
      : <select id={fieldId} className="ui-control brawndo-pilot-tool-field__select gn-answer"
        value={showOther ? OTHER : answer} onChange={selectTool} disabled={disabled}
        aria-describedby={describedBy}>
        <option value="">Choose a tool or location</option>
        {options.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
        <option value={OTHER}>Other tool or location</option>
        <option value="Not sure">Not sure</option>
      </select>}
    <p id={fieldId + '-help'} className="brawndo-pilot-tool-field__help">
      {!textOnly && !showOther && selected?.scopeLimit && <>{selected.scopeLimit} </>}
      Record what is actually used. Selecting a tool does not demonstrate complete coverage, implementation or verification.
    </p>
    {!textOnly && showOther && <div className="brawndo-pilot-tool-field__other">
      <label htmlFor={fieldId + '-other'}>Other tool or location</label>
      <Textarea id={fieldId + '-other'} value={answer} onChange={changeText}
        maxLength={2000} disabled={disabled} aria-describedby={describedBy}/>
    </div>}
  </div>;
}
