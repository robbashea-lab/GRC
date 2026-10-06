import {renderToStaticMarkup} from 'react-dom/server';
import RequirementBasis,{SourceReference} from './RequirementBasis';
test('progressive disclosure exposes native classification and references without colored badge walls',()=>{
  const html=renderToStaticMarkup(<RequirementBasis kind="reviews" record={{client_id:'a',recurrence:'quarterly'}} related={{framework_assessments:[{client_id:'a',framework_key:'hipaa',definition_id:'164.308(a)(5)(ii)(A)',framework_assessment_id:'h'}]}} onOpen={()=>{}}/>);
  expect(html).toContain('Addressable is not optional');
  expect(html).toContain('Supports requirements');
  expect(html).toContain('target="_blank"');
  expect(html).not.toContain('Source vs configured cadence');
});
test('missing references remain citations; error is not presented as no relationships',()=>{
  const reference=renderToStaticMarkup(<SourceReference url="javascript:bad">ISO citation</SourceReference>);
  expect(reference).toContain('ISO citation');expect(reference).not.toContain('href=');expect(reference).not.toContain('javascript:');
  const html=renderToStaticMarkup(<RequirementBasis kind="policies" record={{}} error="Unavailable"/>);
  expect(html).toContain('role="alert"');expect(html).not.toContain('No external requirement');
});

test('approved Review layout preserves source, expectations, full references and originating links',()=>{
  const record={client_id:'a',recurrence:'quarterly',policy_id:'p',governance_context:{category:'organizational',rationale:'Review retained evidence'}};
  const related={policies:[{client_id:'a',policy_id:'p',title:'Origin policy'}],framework_assessments:[{client_id:'a',framework_key:'hipaa',definition_id:'164.308(a)(5)(ii)(A)',framework_assessment_id:'h'}]};
  const container=document.createElement('div');
  container.innerHTML=renderToStaticMarkup(<RequirementBasis kind="reviews" record={record} related={related} readable reviewLayout onOpen={()=>{}}/>);
  const columns=container.querySelectorAll('.review-requirements-grid > .review-requirements-column');
  expect(columns).toHaveLength(2);
  expect(columns[0].textContent).toContain('Requirement Source');
  expect(columns[0].textContent).toContain('Review retained evidence');
  expect(columns[0].textContent).not.toContain('Origin policy');
  expect(columns[1].textContent).toContain('Review Frequency');
  expect(columns[1].textContent).toContain('Addressable is not optional');
  expect(columns[1].textContent).toContain('Origin policy');
  expect(container.querySelector('details')).toBeNull();
  const unassociated=renderToStaticMarkup(<RequirementBasis kind="reviews" record={record} readable reviewLayout/>);
  expect(unassociated).toContain('No external requirement basis recorded');
  expect(unassociated).toContain('Review retained evidence');
  const standard=renderToStaticMarkup(<RequirementBasis kind="reviews" record={record} related={related}/>);
  expect(standard).not.toContain('review-requirements-grid');
  expect(standard).toContain('<details');
});
