import {riskLevel} from '@/lib/grcWork';

export function riskCoordinates(row){
  return [row.likelihood_score,row.impact_score].every(n=>Number.isInteger(n)&&n>=1&&n<=5)
    ?`${row.likelihood_score}:${row.impact_score}`:null;
}

export default function BrawndoRiskMatrix({rows,selected,onSelect,loading}){
  const counts={};for(const row of rows){const key=riskCoordinates(row)||'unrated';counts[key]=(counts[key]||0)+1;}
  return <section className="bwp-risk-overview" aria-labelledby="bwp-risk-heading">
    <div><h2 id="bwp-risk-heading">Risk overview</h2><p>Inherent likelihood × impact · current register view before matrix selection</p>
      <div className="bwp-risk-grid" role="group" aria-label="Inherent risk matrix: likelihood decreases downwards; impact increases to the right">
        {[5,4,3,2,1].flatMap(l=>[1,2,3,4,5].map(i=>{const key=`${l}:${i}`,level=riskLevel(l*i);return <button type="button" key={key} disabled={loading} className={`bwp-risk-cell is-${level}`} aria-pressed={selected===key} aria-label={`Likelihood ${l}, impact ${i}, ${level}: ${loading?'loading':counts[key]||0} risks`} onClick={()=>onSelect(selected===key?null:key)}><strong>{loading?'—':counts[key]||0}</strong><small>{l} × {i}</small></button>;}))}
      </div><div className="bwp-risk-axis"><span>Likelihood ↑</span><span>Impact →</span></div>
    </div>
    <div className="bwp-risk-context"><h3>Make exposure visible</h3><p>Select a cell to focus the register on that rating. Clear the selection to return to the same search and filters.</p>
      <p>{loading?'Loading risks…':`${rows.length} risks in this view · ${counts.unrated||0} without a complete rating`}</p>
      {!!counts.unrated&&<button type="button" className="bpage-btn" aria-pressed={selected==='unrated'} onClick={()=>onSelect(selected==='unrated'?null:'unrated')}>View unrated risks</button>}
      {selected&&<button type="button" className="bpage-btn" onClick={()=>onSelect(null)}>Clear matrix selection</button>}
      <p className="bpage-meta">Existing score bands: Critical ≥15 · High ≥10 · Moderate ≥5 · Low &lt;5. Residual ratings are not recorded by the current risk model; these are not residual scores.</p>
    </div>
  </section>;
}
