import {calendarDay} from './managementDates';

// A register refresh is an instant; saved review dates remain literal calendar dates.
export function riskRefreshLabel(value) {
  const instant=new Date(value);
  if(!value||Number.isNaN(instant.getTime()))return null;
  const options={timeZone:'America/New_York'};
  const date=instant.toLocaleDateString('en-US',{...options,month:'short',day:'numeric',year:'numeric'});
  const time=instant.toLocaleTimeString('en-US',{...options,hour:'numeric',minute:'2-digit'});
  return `${date}, ${time} ET`;
}

export function riskReviewDate(value,{compact=false,now=new Date()}={}) {
  const day=calendarDay(value);
  if(day===null)return null;
  const date=new Date(day*86400000);
  const year=!compact||date.getUTCFullYear()!==now.getUTCFullYear()?'numeric':undefined;
  return date.toLocaleDateString('en-US',{month:'short',day:'numeric',year,timeZone:'UTC'});
}
