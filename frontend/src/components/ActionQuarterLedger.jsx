import {useMemo} from 'react';
import {actionConceptEvents, actionConceptPriority} from '@/lib/cisActionItemsConcept';
import V3QuarterLedger from './V3QuarterLedger';

export default function ActionQuarterLedger({rows,scopeKey,available,recordOpen,now,onOpen}) {
  const events = useMemo(()=>{
    if (!available) return [];
    const result = actionConceptEvents(rows);
    const seen = new Set(result.map(event=>event.id));
    for (const record of rows) {
      for (const task of record.actions || []) {
        if (task.status !== 'done' || !task.task_id || !task.due_date) continue;
        const clientId = record.raw?.client_id || record.client_id;
        if (!clientId || (task.client_id && task.client_id !== clientId)) continue;
        const id = clientId + ':action:' + task.task_id;
        if (seen.has(id)) continue;
        result.push({id,kind:actionConceptPriority(task.priority).key,date:task.due_date,status:task.status,title:task.title || record.title,task,record});
        seen.add(id);
      }
    }
    return result;
  },[available,rows]);
  return <V3QuarterLedger key={scopeKey} kind="actions" events={events} available={available} recordOpen={recordOpen} now={now} onOpen={onOpen}/>;
}
