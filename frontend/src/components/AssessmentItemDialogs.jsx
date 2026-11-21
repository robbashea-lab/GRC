import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import AssigneeSelect from './AssigneeSelect';

// Native commands and draft identity remain in AssessmentItems; these forms only collect input.
export function AddAssessmentItemDialog({open,onOpenChange,draft,onChange,onSubmit,busy,disabled,error,unconfirmed,portalContainer}){
  const blocked=disabled||busy||unconfirmed;
  return <Dialog open={open} onOpenChange={value=>{if(!busy&&!unconfirmed)onOpenChange(value);}}>
    <DialogContent className="brawndo-assessment-pilot gn-dialog-box" portalContainer={portalContainer}>
      <DialogTitle>Add item to address</DialogTitle>
      <DialogDescription>Track a gap or an open question for this assessment.</DialogDescription>
      <label className="sg11-field">Type<select className="gn-field" aria-label="Item type" disabled={blocked} value={draft.item_type} onChange={event=>onChange('item_type',event.target.value)}>
        <option value="gap">Gap</option><option value="confirmation">Needs confirmation</option><option value="evidence">Evidence to link</option>
      </select></label>
      <label className="sg11-field">Description<Textarea className="gn-field" aria-label="Item description" required maxLength={4000} disabled={blocked} value={draft.text} onChange={event=>onChange('text',event.target.value)}/></label>
      {error&&<p role="alert">{error}</p>}
      {unconfirmed&&<p role="status">The original save is unconfirmed. Retry it before changing or closing this form.</p>}
      <div className="gn-dialog-actions"><Button className="gn-button" variant="outline" disabled={busy||unconfirmed} onClick={()=>onOpenChange(false)}>Cancel</Button>
        <Button className="gn-button gn-primary" disabled={disabled||busy||!draft.text.trim()} onClick={onSubmit}>{unconfirmed?'Retry original save':'Add item'}</Button></div>
    </DialogContent>
  </Dialog>;
}

export function AssessmentItemTaskDialog({open,onOpenChange,item,draft,onChange,onSubmit,clientId,users,busy,disabled,error,unconfirmed,portalContainer}){
  const blocked=disabled||busy||unconfirmed;
  return <Dialog open={open} onOpenChange={value=>{if(!busy&&!unconfirmed)onOpenChange(value);}}>
    <DialogContent className="brawndo-assessment-pilot gn-dialog-box" portalContainer={portalContainer}>
      <DialogTitle>Create Action Item</DialogTitle>
      <DialogDescription>{item?.text}</DialogDescription>
      <label className="sg11-field">Title<Input className="gn-field" aria-label="Action title" required maxLength={500} disabled={blocked} value={draft.title} onChange={event=>onChange('title',event.target.value)}/></label>
      <label className="sg11-field">Description<Textarea className="gn-field" aria-label="Action description" maxLength={20000} disabled={blocked} value={draft.description} onChange={event=>onChange('description',event.target.value)}/></label>
      <label className="sg11-field">Priority<select className="gn-field" aria-label="Action priority" disabled={blocked} value={draft.priority} onChange={event=>onChange('priority',event.target.value)}>
        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
      </select></label>
      <div className="sg11-field"><span>Assignee</span><AssigneeSelect label="Action assignee" clientId={clientId} users={users||[]} disabled={blocked} value={draft.assignee_id} onChange={value=>onChange('assignee_id',value||null)} showGuidance={false}/></div>
      <label className="sg11-field">Due date (optional)<Input className="gn-field" aria-label="Action due date" type="date" disabled={blocked} value={draft.due_date||''} onChange={event=>onChange('due_date',event.target.value||null)}/></label>
      {error&&<p role="alert">{error}</p>}
      {unconfirmed&&<p role="status">The original Action save is unconfirmed. Retry it before changing or closing this form.</p>}
      <div className="gn-dialog-actions"><Button className="gn-button" variant="outline" disabled={busy||unconfirmed} onClick={()=>onOpenChange(false)}>Cancel</Button>
        <Button className="gn-button gn-primary" disabled={disabled||busy||!draft.title.trim()} onClick={onSubmit}>{unconfirmed?'Retry original save':'Create Action Item'}</Button></div>
    </DialogContent>
  </Dialog>;
}
