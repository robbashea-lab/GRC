// Word layout from the approved v3.0 SSP template.
import SSP_WORD_TEMPLATE from "./sspTemplate.json";
import {officeZip,displayDate,poamId} from "./office";

const statusColors = {
  Implemented:"1E6B34", Verified:"1E6B34", Closed:"1E6B34",
  "Not implemented":"983F3D", "Gap identified":"983F3D",
  "Partially implemented":"8A5300", "Needs validation":"8A5300", "In progress":"8A5300", "Ready for review":"8A5300"
};

export function sspDocx(data, generatedAt) {
  const {fields, sections: definitions} = data;
  const T = SSP_WORD_TEMPLATE;
  const missing = "Not recorded";
  const empty = "–";
  const clean = value => String(value ?? "").trim() || missing;
  const joined = values => values.filter(Boolean).join(" · ");
  const words = value => value.replace(/ & /g," and ");
  const stamp = new Intl.DateTimeFormat("en-US", {
    year:"numeric", month:"long", day:"numeric", timeZone:"America/New_York"
  }).format(generatedAt);
  const utc = generatedAt.toISOString().slice(11,16) + " UTC";
  const utcDate = new Intl.DateTimeFormat("en-US", {
    year:"numeric", month:"long", day:"numeric", timeZone:"UTC"
  }).format(generatedAt);
  const draft = data.draft;
  const requirements = data.items;
  const gaps = data.gaps;
  const remediation = data.workbook?.rows || [];
  const remediationById = new Map(remediation.map(row => [row.id,row]));
  const sections = definitions.map((section,index) => ({...section,title:(index+1) + ". " + words(section.title)}));
  const preFamily = ["Organization context",...sections.map(section => section.title),
    "6. Asset inventory and treatment","7. Applicability and adjudication","8. Security requirement implementation"];
  const postFamily = ["9. Remediation snapshot","10. Reference index","11. Outstanding draft inputs"];
  const familyBuckets = new Map();
  const index = new Map();
  const versionRef = plan => plan && joined([plan.name,plan.st,plan.ver]);
  const durationRef = review => review && joined([review.title,review.st,review.due && "Due " + displayDate(review.due)]);
  const sspFiles = data.evidence.filter(file => file.name);
  const sspRefs = [data.plan && {kind:"SSP record", title:data.plan.name}, data.review && {kind:"SSP record", title:data.review.title},
    ...sspFiles.map(file => ({kind:"SSP record",title:file.name}))].filter(Boolean);
  const displayReq = item => T.requirementText[item.id] || [item.id,item.title];
  for (const item of requirements) {
    const code = displayReq(item)[0].split(".")[0];
    if (!familyBuckets.has(code)) familyBuckets.set(code,{code, title:item.group.replace(/\s+\([A-Z]+\)$/,""), items:[]});
    familyBuckets.get(code).items.push(item);
  }
  const families = [...familyBuckets.values()];
  const contents = [
    ...preFamily.map((title,i) => ({title,key:"sec" + i})),
    ...families.map((family,i) => ({title:"8."+(i+1)+" "+family.title+" ("+family.code+")",key:"fam"+i, family:true})),
    ...postFamily.map((title,i) => ({title,key:"post"+i}))
  ];
  const contentsByTitle = new Map(contents.map((section,i) => [section.title,{...section,id:i+1}]));

  function xml(value) {
    return String(value ?? "").replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,"\ufffd")
      .replace(/[&<>"']/g,character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[character]);
  }

  function fill(fragment, values, attrs = {}) {
    return fragment.replace(/__GN_(T(\d+)|S(\d+)|ID|NAME|ORG|DATE)__/g,(_, key, slot, colorSlot) => {
      if (colorSlot !== undefined) return statusColors[values[Number(colorSlot)]] || "666D74";
      if (slot === undefined) return xml(attrs[key]);
      // Each slot is already inside a w:t. Preserve user-entered line breaks without treating text as XML.
      return xml(values[Number(slot)]).replace(/\r\n|\r|\n/g,'</w:t><w:br/><w:t xml:space="preserve">');
    });
  }
  function table(template, rows, total) {
    if (!rows.length) return "";
    return template.open + rows.map((row,i) => fill(i % 2 ? template.even : template.odd,row)).join("") +
      (total ? fill(template.total,total) : "") + template.close;
  }
  const para = value => fill(T.paragraph,[value]);
  const minor = title => fill(T.subtitle,[title]);
  function heading(title) {
    const target = contentsByTitle.get(title);
    return fill(target.family ? T.family : T.section,[title],{ID:target.id,NAME:target.key});
  }
  function familyTotals(label, rows) {
    const tally = code => rows.filter(row => row.code === code).length || empty;
    return [label,rows.length,tally("I"),tally("P"),tally("N"),tally("A"),rows.filter(row => row.current).length || empty];
  }
  const anonymousReferences = new WeakMap();
  let anonymousReferenceId = 0;
  function referenceKey(reference) {
    if (reference.id !== undefined && reference.id !== null && reference.id !== "") {
      return reference.kind + "\u0000id:" + reference.id;
    }
    const source = reference.source && typeof reference.source === "object" ? reference.source : reference;
    if (!anonymousReferences.has(source)) anonymousReferences.set(source,++anonymousReferenceId);
    return reference.kind + "\u0000record:" + anonymousReferences.get(source);
  }
  function refer(ref) {
    if (!ref.title) return;
    const key = referenceKey(ref);
    if (!index.has(key)) index.set(key,ref);
  }
  function requirementCard(item) {
    const [id, title] = displayReq(item);
    const work = remediationById.get(item.id);
    const references = item.references;
    const byIdentity = new Map();
    for (const reference of references) {
      if (!reference.title) continue;
      const key = referenceKey(reference);
      if (!byIdentity.has(key)) byIdentity.set(key,reference);
    }
    const unique = [...byIdentity.values()];
    unique.forEach(refer);
    const template = T.requirement;
    const refs = unique.length ? unique.map(reference => fill(template.refLine,[reference.kind+"  ",reference.title,
      joined([reference.status,reference.metadata]) ? " · "+joined([reference.status,reference.metadata]) : ""])).join("") : para("None");
    return template.open + fill(template.heading,[id,"   "+title]) + fill(template.facts,[
      clean(item.status),clean(item.verification),clean(item.owner),work ? poamId(work) : "None"
    ]) + fill(template.narrative,[clean(item.current)]) + template.refs.replace("__GN_REFS__",() => refs) + template.close + T.spacer;
  }
  function sectionRows(section) {
    return fields.filter(field => field.section === section.id)
      .map(field => [words(field.label),clean(draft[field.id])]);
  }

  let body = T.opening + fill(T.org,[data.organization]) + fill(T.draft,[
    "Generated from GoverNara workspace records on "+stamp+". "+
      (gaps.length ? gaps.length+" inputs still need an answer before this plan can be finalized. Section 11 lists them."
        : "Confirm the recorded scope, implementation and approvals before finalizing the plan.")
  ]) + T.spacer + T.detailsLabel;
  body += table(T.details,[
    ["Prepared for",clean(data.organization)],["Prepared by","iVenture Solutions"],["System / enclave",clean(draft.system)],
    ["Document identifier",clean(draft.documentId)],["Document version",clean(draft.version)],["SSP owner",clean(draft.owner)],
    ["Generated at",utcDate+" at "+utc],["Source","Saved GoverNara workspace records and draft inputs"]
  ]) + T.spacer + T.glanceLabel;
  body += fill(T.glance,[
    requirements.filter(row => row.code === "I").length, "of "+requirements.length+" requirements implemented",
    data.narrativeCount, "of "+requirements.length+" have an implementation narrative",
    remediation.filter(row => row.status !== "Closed").length, "open POA&M items (section 9)", gaps.length,"draft inputs to review (section 11)"
  ]) + T.spacer + fill(T.intro,["Prepared by iVenture Solutions for "+data.organization+
    ". This plan describes the system boundary, environment and how each NIST SP 800-171 Rev 2 security requirement is implemented. It contains security-sensitive details. Share it only with people who need it, such as your assessor or contracting officer."]) +
    T.page + T.contentsLabel + contents.map(section => fill(section.family ? T.contentsFamily : T.contentsSection,
      [section.title],{NAME:section.key})).join("") + T.page;
  body += heading(preFamily[0]) + para("Client profile context. Confirm what applies within the documented system boundary.") +
    table(T.detailsTable,[["Organization",clean(data.organization)],["Primary contact",clean(data.primary)],
      ["GRC lead",clean(data.lead)],["Organization environment",clean(joined(data.profileEnv))]]);
  for (const section of sections) body += heading(section.title) + para(section.description) + table(T.detailsTable,sectionRows(section));

  body += heading(preFamily[6]) + para(data.assets.length ?
    "Workspace inventory snapshot. Reconcile these entries with the authoritative inventories and current diagrams." :
    "No systems recorded in the client inventory. Reconcile this plan with the authoritative inventory and boundary.") +
    table(T.assets,data.assets.map(({asset,key,category}) => [asset.name,clean(asset.type),clean(asset.loc),clean(asset.owner),
      category,clean(draft.assetTreatment?.[key])]));

  const decisions = data.decisions;
  body += heading(preFamily[7]) + para(decisions.length ?
    "Scope rationale and recorded approvals or adjudications are listed separately for each requirement." :
    "No applicability decisions are recorded in this snapshot. Confirm applicability against the assessment scope.");
  if (decisions.length) body += table(T.detailsTable,decisions.map(row => {
    const decision = row.decision;
    const label = ({approved:"Approval recorded",adjudicated:"Favorable DoD CIO adjudication recorded"})[decision.outcome] || "Pending review";
    return [(T.requirementText[row.id]?.[0] || row.id) + " · " + row.title, [
      "Saved scope rationale: "+clean(row.rationale),"Decision: "+label,
      !row.current && decision.outcome && decision.outcome !== "pending" ? "Historical record. Review against the current assessment scope." : "",
      "Authority: "+clean(decision.authority),"Date: "+clean(decision.date),"Reference: "+clean(decision.reference),
      decision.notes ? "Notes: "+decision.notes : ""
    ].filter(Boolean).join("\n")];
  }));

  body += heading(preFamily[8]) + para(data.narrativeCount+" of "+requirements.length+
    " requirements have saved implementation notes. Status, verification and references come from the requirement register.") +
    minor("Implementation summary") + table(T.families,families.map(family => familyTotals(family.code+" · "+family.title,family.items)),
      familyTotals("Total",requirements)) + (() => {
        const marked = requirements.filter(item => item.code === "X");
        if (!marked.length) return "";
        const byFamily = families.map(family => {
          const count = family.items.filter(item => item.code === "X").length;
          return count ? family.code+": "+count : "";
        }).filter(Boolean).join(" · ");
        return para("Marked Not applicable: "+marked.length+" ("+byFamily+"). These records are included in the Requirements total and listed separately from the four implementation-status columns. The status alone does not establish scope approval or adjudication; review section 7.");
      })() + T.scopeNote + minor("Linked SSP records") +
    table(T.detailsTable,[["Linked SSP policy",clean(versionRef(data.plan))],["Linked SSP review",clean(durationRef(data.review))],
      ["Linked SSP evidence",clean(sspFiles.map(file => file.name).join("\n"))]]);
  sspRefs.forEach(refer);
  for (const [i,family] of families.entries()) {
    body += heading("8."+(i+1)+" "+family.title+" ("+family.code+")") + family.items.map(requirementCard).join("");
  }

  body += heading(postFamily[0]) + para(remediation.length ?
    "Source: saved requirement assessments and the POA&M workbook. Assessment credit depends on reassessment after remediation." :
    "No remediation items are recorded. Review assessment coverage and open scoring inputs in the workspace.");
  if (remediation.length) {
    const reqCode = row => T.requirementText[row.id]?.[0] || row.id;
    body += minor("Summary") + table(T.poamSummary,remediation.map(row => [
      poamId(row),reqCode(row),clean(row.milestone),clean(row.pointLabel),row.due || "Not scheduled",clean(row.status)
    ])) + minor("Item detail");
    body += remediation.map(row => {
      const actions = (row.source?.actions || []).map(action => joined([action.title,action.st,action.owner,action.due && "Due "+displayDate(action.due)]));
      actions.forEach((value,i) => refer({kind:"Action item",id:row.source.actions[i].id,title:row.source.actions[i].title,status:row.source.actions[i].st,
        metadata:joined([row.source.actions[i].pri && row.source.actions[i].pri+" priority",row.source.actions[i].owner,
          row.source.actions[i].due && "Due "+displayDate(row.source.actions[i].due)])}));
      const closeout = [row.closeout,row.closedAt && "Closeout recorded: "+joined([row.closedAt,row.closedBy]),
        row.status === "Closed" && row.currentGap ? "Reassessment pending. The saved assessment still records a gap." : ""].filter(Boolean);
      return fill(T.poamCard,[poamId(row),"  ·  "+reqCode(row),"   "+(T.requirementText[row.id]?.[1] || row.title),
        clean(row.status),clean(row.pointLabel),row.owner || "Unassigned",row.due || "Not scheduled",
        clean(row.eligibilityReason),clean(row.milestone),clean(row.gapNotes),clean(row.notes),clean(closeout.join("\n")),
        clean(row.evidence),actions.join("\n") || "None"]) + T.spacer;
    }).join("");
  }

  body += heading(postFamily[1]) + para("Record references identify the current source. File attachments are stored separately.");
  for (const [kind,name] of [["SSP record","SSP records"],["Policy","Policies"],["Review","Reviews"],["Tool","Tools"],
      ["Evidence","Evidence"],["Action item","Action items"],["Risk","Risks"],["Vendor","Vendors"],["AI system","AI systems"]]) {
    const entries = [...index.values()].filter(reference => reference.kind === kind);
    if (!entries.length) continue;
    body += minor(name+" ("+entries.length+")") + table(T.references,entries.map(reference => [
      reference.title,joined([reference.status,reference.metadata]) || empty
    ]));
  }
  body += minor("Standards and regulations") + T.standards;

  body += heading(postFamily[2]) + para(gaps.length ? gaps.length+
    " tracked inputs need review. Each one appears in the sections above and needs an answer before this plan can be finalized." :
    "All tracked inputs contain a value. Confirm scope, implementation, evidence and approvals before relying on the draft.");
  const fieldGaps = sections.map(section => [section.title,fields
    .filter(field => field.section === section.id && !String(draft[field.id] || "").trim())
    .map(field => words(field.label))]).filter(([,list]) => list.length);
  if (fieldGaps.length) {
    body += minor("Plan details ("+fieldGaps.reduce((sum,[,list]) => sum+list.length,0)+")") +
      table(T.gapsFields,fieldGaps.map(([title,list]) => [title,list.join("\n")]));
  }
  const assetGaps = data.assets.map(row => [row.asset.name,[
    !row.code && "Scope category",!String(draft.assetTreatment?.[row.key] || "").trim() && "Treatment / scope rationale"
  ].filter(Boolean)]).filter(([,list]) => list.length);
  if (!data.assets.length || assetGaps.length) {
    body += minor("Asset inventory ("+Math.max(1,assetGaps.reduce((sum,[,list]) => sum+list.length,0))+")") +
      (assetGaps.length ? table(T.gapsAssets,assetGaps.map(([asset,list]) => [asset,list.join(" · ")])) :
        para("Reconcile the authoritative asset inventory. No systems are recorded here."));
  }
  const reqGaps = requirements.filter(row => !row.current).map(row => displayReq(row)[0]);
  if (reqGaps.length) {
    const height = Math.ceil(reqGaps.length/6);
    body += minor("Implementation narratives ("+reqGaps.length+")") +
      para("These requirements have no implementation narrative yet. Section 8 shows each one as not recorded.") +
      table(T.gapsRequirements,Array.from({length:height},(_,row) => Array.from({length:6},(_,col) =>
        reqGaps[col*height+row] || "")));
  }
  const decisionGaps = gaps.filter(gap => gap.section === "decisions");
  if (decisionGaps.length) body += minor("Applicability decisions ("+decisionGaps.length+")") +
    decisionGaps.map(gap => para(gap.label)).join("");

  const parts = Object.entries(T.parts).map(([name,contents]) => [name,
    typeof contents === "string" ?
      (name === "docProps/core.xml" || name === "word/footer1.xml" ?
        fill(contents,[],{ORG:data.organization,DATE:generatedAt.toISOString()}) : contents) :
      Uint8Array.from(atob(contents.base64),character => character.charCodeAt(0))
  ]);
  parts.push(["word/document.xml",T.prefix+body+T.end]);
  return officeZip(parts);
}
