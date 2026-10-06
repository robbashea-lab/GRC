import {riskMatches,nextRiskReview,newRiskDefaults,pilotRiskStatus,riskColumns} from './brawndoRisks';
import {tableColumns} from './tableColumns';
const now=new Date('2026-09-29T12:00:00Z');
test('review boundaries include today, preserve undated active and accepted severity',()=>{
 const base={status:'accepted',accepted_by:'admin',acceptance_date:'2026-01-01',acceptance_rationale:'Authorized decision',acceptance_expires_at:'2027-01-01',likelihood_score:4,impact_score:5,next_review:'2026-09-29'};
 expect(riskMatches(base,'overdue',now)).toBe(false);expect(riskMatches(base,'review_due',now)).toBe(true);expect(riskMatches(base,'upcoming',now)).toBe(false);
 for(const v of ['all_active','critical','accepted','unassigned'])expect(riskMatches(base,v,now)).toBe(true);
 expect(riskMatches({...base,next_review:'2026-10-29'},'upcoming',now)).toBe(true);expect(riskMatches({...base,next_review:'2026-10-30'},'upcoming',now)).toBe(false);
 expect(riskMatches({...base,next_review:'2026-09-28'},'overdue',now)).toBe(true);
 expect(riskMatches({...base,next_review:null},'all_active',now)).toBe(true);expect(riskMatches({...base,next_review:null},'review_due',now)).toBe(false);
 expect(riskMatches({...base,status:'closed'},'critical',now)).toBe(false);expect(riskMatches({...base,accepted_by:null},'accepted',now)).toBe(false);expect(riskMatches({...base,acceptance_expires_at:'2026-09-01'},'accepted',now)).toBe(false);
});
test('calendar defaults use twelve months, clamp leap dates, never fabricate scores',()=>{
 expect(newRiskDefaults(now)).toMatchObject({treatment:'',review_cadence:'annual',next_review:'2027-09-29',likelihood_score:null,impact_score:null});
 expect(nextRiskReview('2028-02-29')).toBe('2029-02-28');expect(nextRiskReview('2026-09-29','quarterly')).toBe('2026-12-29');expect(nextRiskReview('2026-09-29','none')).toBe('');expect(nextRiskReview('2026-09-29','custom',10)).toBe('2026-10-09');
});
test('presentation preserves native states; categorical filters have no alphabetical sorting',()=>{
 expect(pilotRiskStatus('assessed')).toBe('Open');expect(pilotRiskStatus('in_progress')).toBe('In Treatment');expect(pilotRiskStatus('monitoring')).toBe('Monitoring');
 const columns=riskColumns(tableColumns('risk-register',{rows:[],users:[]}));
 for(const key of ['category','risk_level','owner_id','status'])expect(columns.find(c=>c.key===key).sortable).toBe(false);
 expect(columns.find(c=>c.key==='next_review').sortLabels).toEqual(['Earliest First','Latest First']);expect(columns.find(c=>c.key==='owner_id').label).toBe('Assigned Owner');
});
