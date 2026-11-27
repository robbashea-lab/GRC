// Presentation opt-in only; the native controller still owns permissions and saves.
export function brawndoAssessmentPilotEligible({demoMode,workspaceMode,user,safeguard11,directProgramOpener,record,current,ctx,pathname}) {
  return demoMode===true && workspaceMode==='demo' && user?.workspace_mode==='demo'
    && pathname==='/compliance/cis-ig1' && directProgramOpener===true
    && safeguard11===true && record?.client_id==='demo_brawndo'
    && ctx?.configuration?.implementation_group===1
    && ctx.visualOrigin?.selected===true && ctx.visualOrigin.configured===true
    && ctx.visualOrigin.programId==='demo_brawndo:cis-ig1'
    && ctx.visualOrigin.framework?.key==='cis-ig1' && ctx.visualOrigin.framework.version==='8.1'
    && typeof record.framework_assessment_id==='string' && !!record.framework_assessment_id.trim()
    && [record,current,ctx.current].every(row=>row?.client_id===record.client_id
      && row.framework_key==='cis-ig1' && row.framework_version==='8.1' && row.definition_id==='1.1'
      && row.framework_assessment_id===record.framework_assessment_id);
}

// These callouts explain the existing questions; they add no questionnaire or scoring rule.
const GUIDANCE={
  inventory:{requirement:'Maintain an accurate, detailed and up-to-date inventory of enterprise assets that can store or process data.'},
  existing:{context:'Describe the information that actually exists. Partial records do not establish a complete enterprise inventory.'},
  system:{context:'CIS 1.1 does not prescribe a particular vendor or tool. Record the actual inventory tool or location; selecting it does not confirm complete enterprise coverage.'},
  sources:{requirement:'Include assets in physical, virtual, remote and cloud environments, including regularly connected assets outside enterprise control.',context:'One register or several sources is an implementation approach. Describe each source and its coverage when the native question asks.'},
  owner:{context:'Identify the reported inventory maintainer. A named tool vendor is not the maintainer, and each asset’s owner and department are separate inventory details.'},
  coverage:{requirement:'Include all relevant enterprise assets and environments. A discovery source may cover only part of that scope.'},
  scope_reason:{context:'Retain the native explanation for a reported non-applicable condition. It does not by itself establish complete inventory coverage.'},
  attributes:{requirement:'Record the static network address where applicable, hardware address, machine name, asset owner, department and approval to connect.'},
  maintenance:{requirement:'Keep the enterprise asset inventory accurate and up to date.',context:'Report how asset additions, changes and retirements are reflected in the current records.'},
  maintenance_detail:{context:'Describe the actual update process. This answer is implementation context, not an additional CIS procedure or prescribed tool.'},
  frequency:{requirement:'Review and update the complete enterprise asset inventory ',highlight:'at least every six months',after:', or more frequently.',context:'Select the client’s actual cadence, even when it differs from the requirement. Displaying this requirement does not answer the question.'},
  last_review:{context:'Record the actual last complete review date when known. The required interval is not evidence that a review occurred.'},
  reconciled:{context:'Comparison with other device records can help assess coverage. This native context question does not add a separate CIS 1.1 requirement.'},
  evidence:{context:'Describe supporting records actually available. Interview responses do not verify Evidence, and no file or completed Review is created here.'},
  additional_gap:{context:'Report additional known gaps only. A reported gap does not automatically create a Finding or Action.'},
  gaps:{context:'Describe the additional gap reported in the preceding answer. Keep confirmed gaps distinct from uncertainty.'},
  additional_confirmation:{context:'Report facts that still need confirmation. Unknown information must not be presented as implemented or verified.'},
  unknowns:{context:'Describe what remains unknown or conflicting and who can confirm it, where supplied.'},
};

export function brawndoAssessmentQuestionGuidance(questionId) {
  return GUIDANCE[questionId]||null;
}
