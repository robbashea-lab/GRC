import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import DashboardStatusComparison from './DashboardStatusComparison';

const labels = ['Implemented', 'Partial', 'With gaps', 'Not assessed'];
const keys = ['addressed', 'in_progress', 'needs_attention', 'not_assessed'];
const counts = values => keys.map((key, index) => ({key, count:values[index], label:labels[index]}));
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete global.IS_REACT_ACT_ENVIRONMENT; });

test('the selected program supplies both the percentages and the scoped destination', async () => {
  const host = document.createElement('div'), root = createRoot(host), open = jest.fn();
  const show = props => act(() => root.render(<MemoryRouter><DashboardStatusComparison unit="requirements" verb="implemented" {...props}/></MemoryRouter>));
  try {
    await show({counts:counts([2, 1, 0, 1]), total:4, hrefForStatus:key => '/compliance/cmmc?client_id=alpha&view=' + key});
    expect(host.querySelector('.bfb-big').textContent).toBe('50.0%');
    expect(host.querySelector('.bfb-coverage').textContent).toContain('3 of 4 assessed');
    expect(host.querySelectorAll('a')[1].getAttribute('href')).toBe('/compliance/cmmc?client_id=alpha&view=in_progress');
    await show({counts:counts([0, 0, 0, 0]), total:0, onStatusNavigate:open});
    expect(host.querySelector('.bfb-big').textContent).toBe('—');
    await act(() => host.querySelectorAll('button')[3].click());
    expect(open).toHaveBeenCalledWith('not_assessed');
  } finally { await act(() => root.unmount()); }
});
