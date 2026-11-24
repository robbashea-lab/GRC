import {strToU8} from 'fflate';
import {prepareOfficeSnapshot,scoringRows,workbookTables} from './cmmcFiles/snapshot';

export async function buildCmmcExport(kind, model, generatedAt=new Date()) {
  if (!model?.clientId || !model.clientName || ![1,2].includes(model.level)) throw new Error('Reload the selected CMMC client.');
  const id = model.clientId.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,90);
  if (kind==='ssp') {
    const snapshot=prepareOfficeSnapshot(model);
    if (model.level===1) {
      const {levelOneSsp}=await import('./cmmcFiles/levelOneSsp');
      return {filename:id+'-cmmc-level-1-ssp-draft.html',type:'text/html;charset=utf-8',bytes:strToU8(levelOneSsp(snapshot,generatedAt))};
    }
    const {sspDocx}=await import('./cmmcFiles/sspDocx');
    return {filename:id+'-cmmc-level-2-ssp-draft.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes:sspDocx(snapshot,generatedAt)};
  }
  if (model.level!==2 || !['poam','sprs'].includes(kind)) throw new Error('This workbook requires a CMMC Level 2 program.');
  const ready = model.score.sspReady && model.score.assessed===model.score.total && !model.score.unverified &&
    !model.score.withheld && !model.rows.some(row=>row.reason==='Confirm the implementation condition');
  const score={...model.score,ready,description:!model.score.available?'No requirements have been assessed. The planning floor reflects unresolved inputs.':
    ready?'Working calculation from saved assessments. Confirm scope and the actual assessment result before recording it in SPRS.':
    'Provisional planning calculation. Review assessment coverage, the SSP, scope and evidence before relying on it.'};
  const input = {...model,score};
  let bytes;
  if (kind==='poam') {
    const {poamXlsx}=await import('./cmmcFiles/poamXlsx');
    bytes=poamXlsx(input,workbookTables(input,prepareOfficeSnapshot(input).workbook.rows),generatedAt);
  } else {
    const {sprsXlsx}=await import('./cmmcFiles/sprsXlsx');
    bytes=sprsXlsx(input,scoringRows(input),generatedAt);
  }
  return {filename:id+'-cmmc-'+(kind==='sprs'?'sprs-score':'poam')+'.xlsx',
    type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes};
}

export async function downloadCmmcExport(kind,model,isCurrent=()=>true) {
  if (!isCurrent()) throw new Error('Reopen the current CMMC workspace before downloading.');
  const file=await buildCmmcExport(kind,model);
  if (!isCurrent()) throw new Error('The client or CMMC scope changed before download.');
  const href=URL.createObjectURL(new Blob([file.bytes],{type:file.type}));
  const anchor=document.createElement('a');
  try {
    anchor.href=href;
    anchor.download=file.filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1000);
  }
  return file.filename;
}
