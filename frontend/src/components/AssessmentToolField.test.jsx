import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentToolField from './AssessmentToolField';
import AssessmentQuestionGuidance from './AssessmentQuestionGuidance';
import AssessmentRequirementDisclosure from './AssessmentRequirementDisclosure';

const options = [
  {id: 'intune', label: 'Microsoft Intune', scopeLimit: 'Intune-managed devices only.'},
  {id: 'meraki', label: 'Cisco Meraki', scopeLimit: 'Meraki-visible network assets only.'},
  {id: 'azure', label: 'Microsoft Azure Resource Graph', scopeLimit: 'Azure cloud resources only.'},
];
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function ControlledField({initialValue = '', onChange, ...props}) {
  const [value, setValue] = useState(initialValue);
  return <AssessmentToolField options={options} {...props} value={value} onChange={next => {
    onChange(next);
    setValue(next);
  }}/>;
}
async function render(element) { await act(async () => root.render(element)); }
async function choose(value) {
  await act(async () => {
    const select = container.querySelector('select');
    select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
}
async function type(value) {
  await act(async () => {
    const textarea = container.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, value);
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

test('fresh input stays blank and optional with an accessible label and no mount write', async () => {
  const onChange = jest.fn();
  await render(<AssessmentToolField value="" options={options} onChange={onChange}
    label="Which source is used?" descriptionId="native-guidance"/>);
  const select = container.querySelector('select');
  expect(select.value).toBe('');
  expect(select.required).toBe(false);
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.querySelector('label').htmlFor).toBe(select.id);
  expect(select.getAttribute('aria-describedby').split(' ')).toContain('native-guidance');
  expect(select.getAttribute('aria-describedby').split(' ')).toContain(container.querySelector('p').id);
  expect(onChange).not.toHaveBeenCalled();
});

test('selecting each named option writes the literal label, never the option ID', async () => {
  const onChange = jest.fn();
  await render(<ControlledField onChange={onChange}/>);
  expect([...container.querySelectorAll('select option')].map(option => option.value))
    .toEqual(['', ...options.map(option => option.label), '__other__', 'Not sure']);
  for (const option of options) {
    await choose(option.label);
    expect(onChange).toHaveBeenLastCalledWith(option.label);
    expect(container.querySelector('select').value).toBe(option.label);
    expect(container.textContent).toContain(option.scopeLimit);
  }
  await choose('Not sure');
  expect(onChange).toHaveBeenLastCalledWith('Not sure');
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.textContent).toContain('does not demonstrate complete coverage');
});

test('saved listed, Not sure and custom values restore without any mutation', async () => {
  const onChange = jest.fn();
  for (const value of ['Microsoft Intune', 'Not sure', '  Legacy CMDB\nWest office  ', 'intune', 'x'.repeat(2001)]) {
    await render(<AssessmentToolField value={value} options={options} onChange={onChange}/>);
    const custom = !options.some(option => option.label === value) && value !== 'Not sure';
    expect(container.querySelector('select').value).toBe(custom ? '__other__' : value);
    if (custom) {
      expect(container.querySelector('textarea').value).toBe(value);
      expect(container.querySelector('textarea').maxLength).toBe(2000);
    } else expect(container.querySelector('textarea')).toBeNull();
  }
  expect(onChange).not.toHaveBeenCalled();
});

test('Other accepts blank and exact free text and restores custom text after a named selection', async () => {
  const onChange = jest.fn();
  await render(<ControlledField onChange={onChange}/>);
  await choose('__other__');
  expect(onChange).toHaveBeenLastCalledWith('');
  expect(container.querySelector('textarea').required).toBe(false);
  await type('  Regional source\n+ spreadsheet  ');
  expect(onChange).toHaveBeenLastCalledWith('  Regional source\n+ spreadsheet  ');
  await choose('Microsoft Intune');
  await choose('__other__');
  expect(container.querySelector('textarea').value).toBe('  Regional source\n+ spreadsheet  ');
  expect(onChange).toHaveBeenLastCalledWith('  Regional source\n+ spreadsheet  ');
  expect(onChange.mock.calls.flat()).not.toContain('__other__');
});

test('manual capability and no-vetted-options inputs remain optional native text', async () => {
  const onChange = jest.fn();
  await render(<ControlledField initialValue="manual register" onChange={onChange} manualOnly/>);
  expect(container.querySelector('select')).toBeNull();
  expect(container.querySelector('textarea').value).toBe('manual register');
  expect(onChange).not.toHaveBeenCalled();
  await type('Not sure');
  expect(onChange).toHaveBeenLastCalledWith('Not sure');
  await render(<AssessmentToolField value="" options={[]} onChange={onChange}/>);
  expect(container.querySelector('select')).toBeNull();
  expect(container.querySelector('textarea').required).toBe(false);
});

test('disabled controls cannot change either named or manual values', async () => {
  const onChange = jest.fn();
  await render(<AssessmentToolField value="Microsoft Intune" options={options} onChange={onChange} disabled/>);
  expect(container.querySelector('select').disabled).toBe(true);
  await choose('Not sure');
  await render(<AssessmentToolField value="custom" options={options} onChange={onChange} disabled/>);
  expect(container.querySelector('textarea').disabled).toBe(true);
  await type('changed');
  await render(<AssessmentToolField value="manual" onChange={onChange} manualOnly disabled/>);
  await type('changed again');
  expect(onChange).not.toHaveBeenCalled();
});

test('guidance safely renders full-text highlights, context and a record-specific reference', async () => {
  await render(<AssessmentQuestionGuidance reference="CIS v8.1 · 7.7" descriptionId="native-rule"
    guidance={{requirement: 'Remediate at least monthly.', highlight: 'at least monthly',
      context: '<script>not HTML</script>'}}/>);
  expect(container.querySelector('mark').textContent).toBe('at least monthly');
  expect(container.querySelector('.gn-rule-copy').textContent).toBe('Remediate at least monthly.');
  expect(container.querySelector('#native-rule')).toBe(container.querySelector('.gn-rule-copy'));
  expect(container.querySelector('.gn-rule-reference').textContent).toBe('CIS v8.1 · 7.7');
  expect(container.querySelector('script')).toBeNull();
  expect(container.textContent).toContain('<script>not HTML</script>');
});

test('guidance preserves the existing 1.1 split-copy contract and null native fallback', async () => {
  await render(<AssessmentQuestionGuidance guidance={{requirement: 'Review ',
    highlight: 'at least every six months', after: ', or more frequently.'}}/>);
  expect(container.querySelector('.gn-rule-copy').textContent)
    .toBe('Review at least every six months, or more frequently.');
  await render(<AssessmentQuestionGuidance guidance={{context: 'A tool is not prescribed.'}} descriptionId="native-context"/>);
  expect(container.querySelector('#native-context').textContent).toBe('A tool is not prescribed.');
  await render(<AssessmentQuestionGuidance guidance={null}/>);
  expect(container.innerHTML).toBe('');
});

test('requirement disclosure is collapsed with its own trigger and safe source in the internal band', async () => {
  await render(<AssessmentRequirementDisclosure frameworkLabel="SOC 2" reference="CC1.1"
    text="Authored criterion context" trigger="When departures occur" highlight="departures"
    source={{url: 'https://example.test/source', label: 'Publisher source'}}/>);
  const details = container.querySelector('details');
  expect(details.open).toBe(false);
  expect(details.querySelector('summary').textContent).toContain('What SOC 2 requires');
  expect(details.querySelector('summary').textContent).toContain('CC1.1');
  expect(details.querySelector('.gn-requirement-copy').textContent).toBe('Authored criterion context');
  expect(details.querySelector('.gn-requirement-foot mark').textContent).toBe('departures');
  expect(details.querySelector('.gn-source').getAttribute('href')).toBe('https://example.test/source');
  expect(details.querySelector('.gn-source').rel).toBe('noopener noreferrer');
  expect(container.textContent).not.toContain('six months');
});

test('requirement source cannot create an executable URL or HTML', async () => {
  await render(<AssessmentRequirementDisclosure frameworkLabel="ISO 27001" reference="4.1"
    text="<img src=x onerror=alert(1)>" source="javascript:alert(1)"/>);
  expect(container.querySelector('a')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('.gn-requirement-copy').textContent).toBe('<img src=x onerror=alert(1)>');
});
