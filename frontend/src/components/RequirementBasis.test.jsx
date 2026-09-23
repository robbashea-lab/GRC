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
