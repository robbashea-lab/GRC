import style from './levelOneStyle';
const escape = input => String(input ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value = input => escape(input || 'Not recorded');
const facts = pairs => '<dl class="facts">'+pairs.map(([name,detail])=>
  '<div><dt>'+escape(name)+'</dt><dd>'+value(detail)+'</dd></div>').join('')+'</dl>';
const section = (id,title,body)=>'<section id="'+id+'"><h2>'+escape(title)+'</h2>'+body+'</section>';
export function levelOneSsp(data, generatedAt) {
  const {draft,items,assets,sections,fields} = data;
  const chapters = sections.map((group,n)=>[group.id,(n+1)+'. '+group.title,
    '<p class="muted">'+escape(group.description)+'</p>'+facts(fields.filter(field=>field.section===group.id).map(field=>[field.label,draft[field.id]]))]);
  chapters.push(['inventory','6. Asset inventory & treatment',assets.length?assets.map(row=>
    '<h3>'+value(row.asset.name)+'</h3>'+facts([['Location',row.asset.loc],['Owner',row.asset.owner],['Classification',row.category],
      ['Treatment',draft.assetTreatment[row.key]]])).join(''):'<p>No systems recorded in the client inventory.</p>']);
  chapters.push(['decisions','7. Applicability & adjudication',data.decisions.length?data.decisions.map(row=>
    '<h3>'+escape(row.title)+'</h3>'+facts([['Rationale',row.rationale],['Decision',row.decision.outcome],
      ['Authority',row.decision.authority],['Date',row.decision.date],['Reference',row.decision.reference]])).join(''):'<p>No applicability decisions recorded.</p>']);
  chapters.push(['requirements','8. Security requirement implementation',items.map(row=>
    '<article class="requirement"><div class="req-heading"><h4>'+value(row.practice)+' · '+escape(row.title)+'</h4><span>'+value(row.status)+'</span></div>'+
    facts([['Verification',row.verification],['Owner',row.owner],['Current implementation',row.current],
      ['Supporting references',row.references.map(ref=>ref.title+' · '+ref.id).join('\n')]])+'</article>').join('')]);
  chapters.push(['remediation','9. Remediation snapshot','<p>Level 1 follow-up is internal work. A formal CMMC Level 1 POA&M is not permitted.</p>'+
    data.workbook.rows.map(row=>'<h3>'+escape(row.practice)+'</h3>'+facts([['Status',row.status],['Owner',row.owner],['Milestone',row.milestone],['Closeout',row.closeout]])).join('')]);
  const references = new Map(items.flatMap(row=>row.references.map(ref=>[ref.kind+'|'+ref.id,ref])));
  chapters.push(['references','10. Reference index',facts([...references.values()].map(ref=>[ref.kind,ref.title+' · '+ref.id]))]);
  chapters.push(['outstanding','11. Outstanding draft inputs',data.gaps.length?'<ul>'+data.gaps.map(g=>'<li>'+escape(g.label)+'</li>').join('')+'</ul>':'<p>Review the documented scope and evidence before finalizing.</p>']);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escape(data.organization)+' · System Security Plan draft</title><style>'+style+'</style></head><body>'+
    '<div class="print-tools"><span>GoverNara · SSP working paper</span><button type="button" onclick="window.print()">Print / Save as PDF</button></div>'+
    '<header class="cover"><div class="brand">GoverNara<span>Turn complexity into clarity.</span></div><div class="draft">WORKING DRAFT · FOR REVIEW</div>'+
    '<h1>System Security Plan</h1><p class="organization">'+escape(data.organization)+'</p><p class="system">'+value(draft.system)+'</p>'+
    facts([['Document ID',draft.documentId],['Version',draft.version],['Plan owner',draft.owner],['Prepared snapshot',generatedAt.toISOString()]])+
    '<p>CMMC Level 1 · FAR 52.204-21</p><p class="cover-note">Internal working draft. The 17 mapped checks support 15 parent requirements.</p></header>'+
    '<main><nav class="contents"><h2>Contents</h2><ol>'+chapters.map(([id,title])=>'<li><a href="#ssp-'+id+'">'+escape(title)+'</a></li>').join('')+
    '</ol></nav>'+section('organization','Organization context',facts([['Organization',data.organization],['Primary contact',data.primary],['GRC lead',data.lead],['Environment',data.profileEnv.join(' · ')]]))+
    chapters.map(([id,title,body])=>section('ssp-'+id,title,body)).join('')+'</main><footer>'+escape(data.organization)+' · WORKING DRAFT</footer></body></html>';
}
