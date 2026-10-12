import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {createHash} from 'crypto';
import {GovernanceContent,RiskContent,ComplianceContent,PRISM_FRAMEWORKS,PRISM_STAGES} from './prismContent';

// Full approved source text, normalized only for whitespace; no client content.
const expected = {
  "governance": "a4b0751a959903954733cf9eec2b11b504727979cb11eab851a9ef9033d2d79e",
  "risk": "1aed3dc5becba291da5faf6764370ac568d9722f464db829138f21edeaaed0f9",
  "compliance": "5e05dc042c80385af5a344ab73231e110289b4d21baf121de9eb0a94920fdc4d",
  "framework-soc": "7ce37213fec85e5e677423417ae7705e2f2dd53ff83db3b88a2aeb4226b33d23",
  "framework-iso": "da00f5570d30382e0726851a158902298257c01c13b912918add4ea3d413bb43",
  "framework-ig1": "cab6f21a6d6722efe0189e211da4775b3de16db5155d8082449dc59e46ceb0ba",
  "framework-ig2": "05136404505fde344bdaced901f0e56688df7264b487fe5ea889119befc8c4b8",
  "framework-ig3": "2940efc237ce0547dfb54d55ca7fc69b840a0549c95ac7eb527d5829903a0375",
  "stage-inherent": "0024fc09c1af090b58e5c3df8bdc2b23621354bfd385347c94c83cd71ef6cf28",
  "stage-residual": "823b119336c06d09fc1d113bfcfdab7887c368375e06a3d4431a491b1d88a4c3",
  "stage-target": "ca5ffceef8d0b05f2f6ebf9695235f4d93f93a08515580bf82d8b80a9353da4c"
};
const content = {governance:<GovernanceContent/>,risk:<RiskContent stage="inherent"/>,compliance:<ComplianceContent framework="soc"/>};
for (const [key,value] of Object.entries(PRISM_FRAMEWORKS)) content['framework-'+key]=value;
for (const [key,value] of Object.entries(PRISM_STAGES)) content['stage-'+key]=value;
test.each(Object.keys(expected))('%s retains all approved reference copy', async key => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'), root = createRoot(element);
  try {
    await act(async () => root.render(content[key]));
    const text = element.textContent.replace(/\s+/g,' ').trim();
    expect(createHash('sha256').update(text).digest('hex')).toBe(expected[key]);
  } finally { await act(async () => root.unmount()); }
});
