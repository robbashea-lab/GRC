import React, {useId, useState} from 'react';
import {Textarea} from './ui/textarea';

const TOOL_GROUPS = [
  {
    label: 'Inventory tools and registers',
    tools: [
      {value: 'NinjaOne', label: 'NinjaOne', help: 'Endpoint and IT asset inventory.'},
      {value: 'Microsoft Intune', label: 'Microsoft Intune', help: 'Inventory of Intune-managed devices only; other assets need another source.'},
      {value: 'ConnectWise PSA', label: 'ConnectWise PSA — configuration records', help: 'Configuration and asset records maintained in ConnectWise PSA.'},
      {value: 'SharePoint / Microsoft Lists', label: 'SharePoint / Microsoft Lists — asset register', help: 'An asset register maintained in SharePoint or Microsoft Lists.'},
      {value: 'Microsoft Excel', label: 'Microsoft Excel — asset register', help: 'A maintained spreadsheet register; devices are not discovered automatically.'},
      {value: 'ServiceNow IT Asset Management', label: 'ServiceNow — IT asset management', help: 'IT asset records and a configuration management database.'},
      {value: 'Lansweeper', label: 'Lansweeper', help: 'Discovered IT asset inventory.'},
    ],
  },
  {
    label: 'Additional inventory sources',
    tools: [
      {value: 'Cisco Meraki', label: 'Cisco Meraki — network assets', help: 'Meraki devices and observed network clients; off-network assets may need another source.'},
      {value: 'FortiManager', label: 'FortiManager — managed Fortinet devices', help: 'Managed Fortinet devices; use the next question for other asset sources.'},
      {value: 'Fortinet FortiGate', label: 'Fortinet FortiGate — network device visibility', help: 'Devices visible through enabled FortiGate discovery; coverage depends on network visibility.'},
      {value: 'Microsoft Azure Resource Graph', label: 'Microsoft Azure Resource Graph — cloud resources', help: 'Azure cloud resources only; use the next question for endpoint and network sources.'},
    ],
  },
];
const TOOLS = TOOL_GROUPS.flatMap(group => group.tools);
const OTHER_OPTION = '__other__';

export default function BrawndoInventoryToolField({value = '', onChange, disabled = false, label = 'Tool or location', descriptionId}) {
  const fieldId = useId();
  const selectedTool = TOOLS.find(tool => tool.value === value);
  const unlisted = value !== '' && !selectedTool && value !== 'Not sure';
  const [customAnswer, setCustomAnswer] = useState(() => unlisted ? value : '');
  // Other is presentation state; the native answer remains the exact string.
  const [otherSelection, setOtherSelection] = useState(null);
  const showOther = unlisted || otherSelection === value;
  const describedBy = [descriptionId, `${fieldId}-help`].filter(Boolean).join(' ');

  function selectTool(event) {
    if (disabled) return;
    const next = event.target.value;
    if (next === OTHER_OPTION) {
      const answer = showOther ? value : customAnswer;
      setOtherSelection(answer);
      onChange(answer);
      return;
    }
    if (showOther) setCustomAnswer(value);
    setOtherSelection(null);
    onChange(next);
  }

  function changeCustomAnswer(event) {
    if (disabled) return;
    const answer = event.target.value;
    setCustomAnswer(answer);
    setOtherSelection(answer);
    onChange(answer);
  }

  return <div className="brawndo-pilot-tool-field">
    <label htmlFor={fieldId}>{label}</label>
    <select id={fieldId} className="ui-control brawndo-pilot-tool-field__select"
      value={showOther ? OTHER_OPTION : value} onChange={selectTool}
      disabled={disabled} aria-describedby={describedBy}>
      <option value="">Choose a tool or location</option>
      {TOOL_GROUPS.map(group => <optgroup key={group.label} label={group.label}>
        {group.tools.map(tool => <option key={tool.value} value={tool.value}>{tool.label}</option>)}
      </optgroup>)}
      <option value={OTHER_OPTION}>Other tool or location</option>
      <option value="Not sure">Not sure</option>
    </select>
    <p id={`${fieldId}-help`} className="brawndo-pilot-tool-field__help">
      {!showOther && selectedTool && <>{selectedTool.help} </>}
      Selecting a tool does not confirm complete enterprise coverage.
    </p>
    {showOther && <div className="brawndo-pilot-tool-field__other">
      <label htmlFor={`${fieldId}-other`}>Other tool or location</label>
      <Textarea id={`${fieldId}-other`} value={value} onChange={changeCustomAnswer}
        maxLength={2000} disabled={disabled} aria-describedby={describedBy}/>
    </div>}
  </div>;
}
