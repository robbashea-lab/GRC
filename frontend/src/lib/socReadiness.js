import {recordUuid} from './recordUuid';
export const SOC_CATEGORIES={security:'Security / Common Criteria',availability:'Availability',confidentiality:'Confidentiality',processing_integrity:'Processing Integrity',privacy:'Privacy'};
export const socConfiguration=client=>({categories:['security'],system_description:'',period_start:'',period_end:'',...client?.framework_settings?.['soc-2']});
export const controlGap=control=>control.expected_instances==null||control.collected_instances==null?null:Math.max(0,control.expected_instances-control.collected_instances);
export const newManagementControl=(period={})=>({control_id:recordUuid(),name:'',description:'',design:'not_assessed',operating:'not_assessed',frequency:'',period_start:period.period_start||'',period_end:period.period_end||'',expected_instances:null,collected_instances:null,population_notes:'',testing_notes:''});

function period(start,end){
  if(!start&&!end)return;
  if(!start||!end)throw new Error('Provide both evidence-period dates');
  for(const value of [start,end]){
    const parsed=new Date(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new Error('Use valid YYYY-MM-DD evidence-period dates');
  }
  if(end<start)throw new Error('Evidence period must end on or after its start');
}
function text(value,max,label){
  if(typeof value!=='string'||value.trim().length>max)throw new Error('Invalid '+label);
  return value.trim();
}
export function validateSocConfiguration(body){
  if(Object.keys(body).some(k=>!['client_id','categories','system_description','period_start','period_end'].includes(k)))throw new Error('Unknown SOC 2 configuration fields');
  const cid=text(body.client_id,160,'client');
  const categories=body.categories===undefined?['security']:body.categories;
  if(!cid||!Array.isArray(categories)||categories.length>5||!categories.includes('security')||new Set(categories).size!==categories.length||categories.some(c=>!SOC_CATEGORIES[c]))throw new Error('Common Criteria must remain in scope; categories must be valid and unique');
  const config={categories,system_description:text(body.system_description===undefined?'':body.system_description,4000,'system description'),period_start:text(body.period_start===undefined?'':body.period_start,10,'period start'),period_end:text(body.period_end===undefined?'':body.period_end,10,'period end')};
  period(config.period_start,config.period_end);return config;
}
export function validateManagementControls(values){
  if(!Array.isArray(values)||values.length>30)throw new Error('Use at most 30 management control descriptions per criterion');
  const fields=['control_id','name','description','design','operating','frequency','period_start','period_end','expected_instances','collected_instances','population_notes','testing_notes'];
  const normalized=values.map(c=>{
    if(!c||typeof c!=='object'||Object.keys(c).some(k=>!fields.includes(k)))throw new Error('Unknown management control fields');
    const result={control_id:text(c.control_id,80,'control identifier'),name:text(c.name,200,'control name'),
      design:c.design===undefined?'not_assessed':c.design,operating:c.operating===undefined?'not_assessed':c.operating};
    if(!result.control_id||!result.name||!['not_assessed','adequate','gap'].includes(result.design)||!['not_assessed','effective','gap'].includes(result.operating))throw new Error('Provide a control name and valid readiness states');
    for(const k of ['description','frequency','period_start','period_end','population_notes','testing_notes'])result[k]=text(c[k]===undefined?'':c[k],k.startsWith('period_')?10:k==='frequency'?200:4000,k);
    for(const k of ['expected_instances','collected_instances']){
      const value=c[k]??null;
      if(value!==null&&(!Number.isInteger(value)||value<0||value>1000000))throw new Error('Instance counts must be whole numbers from 0 to 1000000');
      result[k]=value;
    }
    period(result.period_start,result.period_end);
    if((result.expected_instances!==null||result.collected_instances!==null)&&!result.period_start)throw new Error('Instance counts require a defined evidence period');
    return result;
  });
  if(new Set(normalized.map(c=>c.control_id)).size!==normalized.length)throw new Error('Management control identifiers must be unique');
  return normalized;
}
