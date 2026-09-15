import { reviewDisplayValue } from './reviewPresentation';
import { SCHEMAS } from './schemas';

test.each(['review_type', 'recurrence'])('%s labels reuse configured terms without changing stored values', key => {
  for (const option of SCHEMAS.reviews.fields.find(f => f.name === key).options) {
    const record = Object.freeze({[key]:option.value});
    expect(reviewDisplayValue(key, record[key])).toBe(option.label);
    expect(record[key]).toBe(option.value);
  }
});
test('unknown and missing display values remain honest', () => {
  expect(reviewDisplayValue('review_type','risk_assessment')).toBe('risk assessment');
  expect(reviewDisplayValue('review_type','custom_client_type')).toBe('custom client type');
  expect(reviewDisplayValue('recurrence',null)).toBe('—');
});
