// Preserve the approved SPRS dashboard, calculation cells and print settings.
import CMMC_SPRS_WORKBOOK_TEMPLATE from "./sprsTemplate.json";
import {officeZip} from "./office";

function cmmcSprsWorkbookDate(value) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone:"America/New_York", year:"numeric", month:"numeric", day:"numeric"
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type,part.value]));
  return (Date.UTC(+parts.year,+parts.month-1,+parts.day) - Date.UTC(1899,11,30)) / 86400000;
}
function cmmcSprsDashboardFormulas(rows,score) {
  const sum = (source,key) => source.reduce((total,row) => total + row[key],0);
  const status = {
    implemented:"Implemented", partial:"Partially implemented",
    missing:"Not implemented", awaiting:"Not assessed", scope:"Not applicable (unconfirmed)"
  };
  const statusRows = (source,key) => source.filter(row => row.status === status[key]);
  const unassessed = source => statusRows(source,"awaiting").concat(statusRows(source,"scope"));
  const verification = label => rows.filter(row => row.verification === label).length;
  const deductions = sum(rows,"deducted"), withholding = sum(rows,"withheld"), max = score.total;
  const working = max - deductions, minimum = Math.ceil(0.8 * max);
  const high = rows.filter(row => row.deducted >= 3).sort((a,b) => b.deducted - a.deducted);
  const cache = {
    B14:working, D14:deductions, F14:statusRows(rows,"implemented").length,
    H14:statusRows(rows,"partial").length+statusRows(rows,"missing").length, J14:unassessed(rows).length,
    L14:verification("Verified"),
    B15:"of "+max+" maximum · workspace calculation",
    D15:withholding+" withheld pending review", F15:"of "+rows.length+" requirements",
    H15:statusRows(rows,"partial").length+" partial · "+statusRows(rows,"missing").length+" not implemented",
    L15:verification("Needs validation")+" need validation",
    F20:deductions,F21:working,F22:withholding,F23:working+withholding,F24:minimum,
    F25:Math.max(0,minimum-working), F26:rows.length-unassessed(rows).length,
    E35:rows.length,G35:deductions,L35:rows.filter(row => row.verification).length,
    B78:high.length+" requirements cost 3 or 5 points each"+(high.length>20 ?
      ", and the 20 largest are listed. Filter Points deducted on the Implementation tab for the rest" : "")+
      ". For Conditional Level 2 status none of them can remain on a POA&M, except SC.L2-3.13.11 at 3 points when encryption is used but not FIPS-validated (32 CFR 170.21)."
  };
  const implementation = ["implemented","partial","missing","awaiting"];
  const verifications = ["Verified","Needs validation","Gap identified","Not verified"];
  for (let index=0; index<implementation.length; index++) {
    const n = 31+index;
    const subset = index===3 ? unassessed(rows) : statusRows(rows,implementation[index]);
    cache["E"+n] = subset.length;
    cache["G"+n] = sum(subset,"deducted");
    cache["L"+n] = verification(verifications[index]);
  }
  const families = ["AC","AT","AU","CM","IA","IR","MA","MP","PS","PE","RA","CA","SC","SI"];
  for (const [index,family] of families.entries()) {
    const familyRows = rows.filter(row => row.id.startsWith(family+"."));
    const n = 39+index;
    cache["F"+n] = familyRows.length;
    cache["G"+n] = statusRows(familyRows,"implemented").length;
    cache["H"+n] = statusRows(familyRows,"partial").length+statusRows(familyRows,"missing").length;
    cache["I"+n] = unassessed(familyRows).length;
    cache["J"+n] = sum(familyRows,"deducted");
    cache["K"+n] = sum(familyRows,"withheld");
    cache["L"+n] = deductions ? cache["J"+n] / deductions : 0;
  }
  for (const col of ["F","G","H","I","J","K"]) {
    cache[col+"53"] = families.reduce((n,_family,index) => n + cache[col+(39+index)],0);
  }
  cache.L53 = deductions ? cache.J53 / deductions : 0;
  for (let index=0; index<20; index++) {
    const row = high[index], n = 57+index;
    cache["B"+n] = row?.id || "";
    cache["C"+n] = row?.description || "";
    cache["I"+n] = row?.status || "";
    cache["K"+n] = row?.deducted ?? "";
    cache["L"+n] = row?.withheld ?? "";
    cache["M"+n] = row?.verification || "";
  }
  return cache;
}

function cmmcSprsWorkbookXml(value) {
  return String(value).replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,"\ufffd")
    .replace(/[&<>"'\r]/g,character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;","\r":"&#13;"}[character]));
}

function cmmcSprsWorkbookText(value) {
  const valueText = String(value).slice(0,32767).replace(/[\ud800-\udbff]$/,"");
  return cmmcSprsWorkbookXml(valueText.replace(/_x[0-9a-fA-F]{4}_/g,part => "_x005F_"+part.slice(1)));
}

function cmmcSprsRenderSheet(template, values, formulas) {
  const payload = {...values,...formulas};
  const lookup = reference => {
    if (!Object.hasOwn(payload,reference)) throw new Error("Missing SPRS workbook cell "+reference);
    return payload[reference];
  };
  return template.replace(/t="__GN_SPRS_TYPE_([A-Z]+\d+)__"/g,(_match,reference) => {
    const value = lookup(reference);
    const type = typeof value === "number" ? "n" : Object.hasOwn(formulas,reference) ? "str" : "inlineStr";
    return 't="'+type+'"';
  }).replace(/<v>__GN_SPRS_VALUE_([A-Z]+\d+)__<\/v>/g,(_match,reference) => {
    const value = lookup(reference);
    if (typeof value === "number") return "<v>"+value+"</v>";
    const text = cmmcSprsWorkbookText(value ?? "");
    return Object.hasOwn(formulas,reference) ? "<v>"+text+"</v>" :
      '<is><t xml:space="preserve">'+text+'</t></is>';
  });
}

export function sprsXlsx(model, rows, generated) {
  const client = {name:model.clientName};
  const score = model.score, post = model.posting, summary = model.score;
  const draftSystem = model.ssp.system;
  const displayDate = new Intl.DateTimeFormat("en-US",{dateStyle:"long",timeZone:"America/New_York"}).format(generated);
  const headline = summary.available ? "Working score" : "Planning floor";
  const values = {
    B3:client.name,C7:client.name,I7:cmmcSprsWorkbookDate(generated),I8:summary.description,
    C10:draftSystem ? "SSP draft system or enclave · "+draftSystem : "Not recorded",
    B13:headline.toUpperCase(),B21:headline,L19:post.score === "" || post.score == null ? "Not recorded" : post.score,L20:post.date || "Not recorded",
    L21:post.scope || "Not recorded",L22:post.cage || "Not recorded",L23:post.reference || "Not recorded",
    F27:score.sspReady?"Verified":"Review needed",
    B80:"Scoring follows the CMMC Level 2 methodology (32 CFR 170.24): the score starts at 110 and loses 5, 3 or 1 point for each requirement not met. Totals update when deductions change on the Implementation tab. Prepared by iVenture Solutions for "+client.name+" from the GoverNara compliance workspace."
  };
  const details = {H1:client.name+" · SPRS score"};
  const detailCache = {E116:rows.reduce((sum,row) => sum+row.deducted,0),F116:rows.reduce((sum,row) => sum+row.withheld,0)};
  for (const [index,row] of rows.entries()) {
    const n = index+5;
    for (const [col,key] of Object.entries({
      A:"id",B:"description",C:"status",D:"verification",E:"deducted",F:"withheld",G:"context",H:"notes",I:"evidence"
    })) details[col+n] = row[key];
    detailCache["J"+n] = row.deducted+(10000-n)/10000000;
  }
  const notes = {
    C5:"A planning calculation of the CMMC Level 2 assessment score for "+client.name+
      ", exported from GoverNara by iVenture Solutions on "+displayDate+". The submitted SPRS record is shown separately.",
    C7:summary.description
  };
  const sheetValues = new Map([
    ["xl/worksheets/sheet1.xml",[values,cmmcSprsDashboardFormulas(rows,score)]],
    ["xl/worksheets/sheet2.xml",[details,detailCache]],
    ["xl/worksheets/sheet3.xml",[notes,{}]]
  ]);
  const files = Object.entries(CMMC_SPRS_WORKBOOK_TEMPLATE).map(([path,template]) => {
    if (typeof template === "object") return [path,Uint8Array.from(atob(template.bytes),character => character.charCodeAt(0))];
    const sheet = sheetValues.get(path);
    const workbookName = sheet ? client.name.replace(/&/g,"&&").replace(/[\r\n]/g," ") : client.name;
    const prepared = template.replaceAll("__GN_SPRS_PRINT_CLIENT__",() => cmmcSprsWorkbookXml(workbookName))
      .replaceAll("__GN_SPRS_GENERATED_AT__",generated.toISOString());
    return [path,sheet ? cmmcSprsRenderSheet(prepared,sheet[0],sheet[1]) : prepared];
  });
  return officeZip(files);
}
