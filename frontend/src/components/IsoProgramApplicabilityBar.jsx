const STATES=[['included','applicable','Necessary','impl'],['excluded','excluded','Not Necessary','part'],['undetermined','undetermined','Decision needed','none']];

export default function IsoProgramApplicabilityBar({counts,available=true,onFilter,filter='all'}){
  const known=available&&counts&&['total','applicable','excluded','undetermined'].every(key=>Number.isInteger(counts[key])&&counts[key]>=0)
    &&counts.applicable+counts.excluded+counts.undetermined===counts.total;
  const interactive=typeof onFilter==='function';
  return <span className={`sbar${filter!=='all'?' hl':''}`} role={interactive?'group':'img'}
    aria-label={known?STATES.map(([,key,label])=>`${label}: ${counts[key]}`).join(', '):'Applicability counts unavailable'}>
    {known&&STATES.map(([key,count,label,tone])=>counts[count]>0&&(interactive?
      <button type="button" key={key} className={`sbar-segment s-${tone}${filter===key?' on':''}`} style={{flex:counts[count]}}
        title={`${label}: ${counts[count]} of ${counts.total}`} aria-label={`${label}: ${counts[count]} of ${counts.total}`} aria-pressed={filter===key}
        onClick={()=>onFilter(filter===key?'all':key)}/>:
      <i key={key} className={`s-${tone}${filter===key?' on':''}`} style={{flex:counts[count]}} title={`${label}: ${counts[count]} of ${counts.total}`}/>))}
  </span>;
}
