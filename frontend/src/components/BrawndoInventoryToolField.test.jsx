import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoInventoryToolField from './BrawndoInventoryToolField';

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
  return <BrawndoInventoryToolField {...props} value={value} onChange={answer => {
    onChange(answer);
    setValue(answer);
  }}/>;
}

async function choose(value) {
  await act(async () => {
    const select = container.querySelector('select');
    select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
}

async function typeOther(value) {
  await act(async () => {
    const textarea = container.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, value);
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

test('a fresh answer stays blank and optional without a mount write', async () => {
  const onChange = jest.fn();
  await act(async () => root.render(<BrawndoInventoryToolField value="" onChange={onChange}
    label="Where is the inventory maintained?" descriptionId="native-question-guidance"/>));
  const select = container.querySelector('select');
  expect(select.value).toBe('');
  expect(select.required).toBe(false);
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.querySelector('label').textContent).toBe('Where is the inventory maintained?');
  expect(container.querySelector('label').htmlFor).toBe(select.id);
  expect(select.getAttribute('aria-describedby').split(' ')).toContain('native-question-guidance');
  expect(select.getAttribute('aria-describedby').split(' ')).toContain(container.querySelector('p').id);
  expect(onChange).not.toHaveBeenCalled();
});

test('all eleven tools keep the exact native string values and two useful groups', async () => {
  const tools = ['NinjaOne', 'Microsoft Intune', 'ConnectWise PSA', 'SharePoint / Microsoft Lists',
    'Microsoft Excel', 'ServiceNow IT Asset Management', 'Lansweeper', 'Cisco Meraki',
    'FortiManager', 'Fortinet FortiGate', 'Microsoft Azure Resource Graph'];
  const onChange = jest.fn();
  await act(async () => root.render(<ControlledField onChange={onChange}/>));
  expect([...container.querySelectorAll('optgroup')].map(group => group.label))
    .toEqual(['Inventory tools and registers', 'Additional inventory sources']);
  expect([...container.querySelectorAll('optgroup option')].map(option => option.value)).toEqual(tools);
  for (const answer of [...tools, 'Not sure']) {
    await choose(answer);
    expect(container.querySelector('select').value).toBe(answer);
    expect(container.querySelector('textarea')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(answer);
  }
  expect(onChange.mock.calls.map(([answer]) => answer)).toEqual([...tools, 'Not sure']);
});

test('saved listed and Not sure answers restore without changing them', async () => {
  const onChange = jest.fn();
  for (const value of ['Microsoft Intune', 'Not sure']) {
    await act(async () => root.render(<BrawndoInventoryToolField value={value} onChange={onChange}/>));
    expect(container.querySelector('select').value).toBe(value);
    expect(container.querySelector('textarea')).toBeNull();
  }
  expect(onChange).not.toHaveBeenCalled();
});

test('unlisted saved answers restore verbatim and refresh from native value without a write', async () => {
  const onChange = jest.fn();
  for (const value of ['  Legacy CMDB\nAsset list — west office  ', 'ninjaone', 'x'.repeat(2001)]) {
    await act(async () => root.render(<BrawndoInventoryToolField value={value} onChange={onChange}/>));
    expect(container.querySelector('select').value).toBe('__other__');
    expect(container.querySelector('textarea').value).toBe(value);
    expect(container.querySelector('textarea').maxLength).toBe(2000);
    expect(container.querySelector('textarea').required).toBe(false);
  }
  expect(onChange).not.toHaveBeenCalled();
});

test('Other accepts blank and exact free text, retains its draft across choices, and never emits its sentinel', async () => {
  const onChange = jest.fn();
  await act(async () => root.render(<ControlledField onChange={onChange}/>));
  await choose('__other__');
  expect(container.querySelector('textarea').value).toBe('');
  expect(container.querySelector('textarea').required).toBe(false);
  expect(onChange).toHaveBeenLastCalledWith('');
  const custom = '  Local register\nplus a second source  ';
  await typeOther(custom);
  expect(container.querySelector('textarea').value).toBe(custom);
  expect(onChange).toHaveBeenLastCalledWith(custom);
  await choose('NinjaOne');
  await choose('__other__');
  expect(container.querySelector('textarea').value).toBe(custom);
  await typeOther('');
  expect(container.querySelector('select').value).toBe('__other__');
  expect(container.querySelector('textarea').value).toBe('');
  expect(onChange.mock.calls.every(([answer]) => typeof answer === 'string' && answer !== '__other__')).toBe(true);
});

test('an explicit Other entry equal to a named tool stays editable until another choice is selected', async () => {
  const onChange = jest.fn();
  await act(async () => root.render(<ControlledField onChange={onChange}/>));
  await choose('__other__');
  await typeOther('NinjaOne');
  expect(container.querySelector('select').value).toBe('__other__');
  expect(container.querySelector('textarea').value).toBe('NinjaOne');
  await choose('Not sure');
  expect(container.querySelector('select').value).toBe('Not sure');
  expect(container.querySelector('textarea')).toBeNull();
});

test('disabled answers disable both native controls and do not publish edits', async () => {
  const onChange = jest.fn();
  await act(async () => root.render(<BrawndoInventoryToolField value="Existing local register" disabled onChange={onChange}/>));
  expect(container.querySelector('select').disabled).toBe(true);
  expect(container.querySelector('textarea').disabled).toBe(true);
  await choose('NinjaOne');
  await typeOther('Attempted replacement');
  expect(onChange).not.toHaveBeenCalled();
});

test('scope help describes partial sources without claiming complete coverage', async () => {
  const onChange = jest.fn();
  await act(async () => root.render(<ControlledField onChange={onChange}/>));
  const expectedHelp = [
    ['Microsoft Intune', 'Intune-managed devices only'],
    ['Cisco Meraki', 'Meraki devices and observed network clients; off-network assets may need another source'],
    ['FortiManager', 'Managed Fortinet devices'],
    ['Fortinet FortiGate', 'coverage depends on network visibility'],
    ['Microsoft Azure Resource Graph', 'Azure cloud resources only'],
  ];
  for (const [answer, help] of expectedHelp) {
    await choose(answer);
    expect(container.querySelector('p').textContent).toContain(help);
    expect(container.querySelector('p').textContent).toContain('Selecting a tool does not confirm complete enterprise coverage.');
  }
});
