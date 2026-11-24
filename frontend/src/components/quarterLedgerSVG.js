// Approved v3 quarter ledger geometry. Only calendar dates and configured lane labels enter the SVG.
export default function quarterLedgerSVG(cfg, range, today, items, W) {
  const [start, end] = range;
  const left = 0, right = W - 14, tableRight = 311;
  const countX = 223, overdueX = 291, headerTop = 4, rowTop = 54;
  const ink = 'var(--ql-ink,var(--text))', muted = 'var(--ql-muted,var(--muted))';
  const paper = 'var(--ql-paper,var(--surface-solid))', accent = 'var(--ql-accent,var(--accent))';
  const rule = 'var(--ql-line,var(--border))', grid = 'var(--ql-grid,var(--divider))';
  const overdueInk = 'var(--ql-overdue,var(--alert))';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
  const fmt = n => Math.round(n * 100) / 100;
  const text = (x, y, label, size=14, fill=ink, weight=500, anchor='start', klass='') =>
    '<text class="'+klass+'" x="'+fmt(x)+'" y="'+fmt(y)+'" fill="'+fill+'" font-size="'+size+
    '" font-weight="'+weight+'" text-anchor="'+anchor+'">'+escape(label)+'</text>';
  const rect = (x, y, width, height, fill, radius=0) =>
    '<rect x="'+fmt(x)+'" y="'+fmt(y)+'" width="'+fmt(width)+'" height="'+fmt(height)+'" rx="'+radius+'" fill="'+fill+'"/>';
  const line = (x1,y1,x2,y2,stroke,width=1,dash='') =>
    '<line x1="'+fmt(x1)+'" y1="'+fmt(y1)+'" x2="'+fmt(x2)+'" y2="'+fmt(y2)+'" stroke="'+stroke+
    '" stroke-width="'+width+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
  const circle = (r,fill,stroke='none',width=0,klass='') =>
    '<circle class="'+klass+'" cx="0" cy="0" r="'+fmt(r)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+width+'"/>';

  // Use local civil dates for day spacing. The native open-item handler needs the original timestamps.
  const calendarDay = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const first = calendarDay(start), last = calendarDay(end), now = calendarDay(today);
  const labelDate = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'});
  const labelMonth = new Intl.DateTimeFormat('en-US',{month:'long'});
  const quarter = 'Q'+(Math.floor(start.getMonth()/3)+1)+' '+start.getFullYear();

  // Fit word boundaries first, then break long identifiers. All lines remain visible as a row grows.
  function laneLines(value) {
    const words = String(value ?? '').trim().split(/\s+/);
    const lines = [];
    let current = '', used = 0;
    const max = 151;
    const charWidth = c => /[ilI1.,:;'’|]/u.test(c) ? 4.5 :
      /[MW@%&]/u.test(c) || c.codePointAt(0)>255 ? 14 : /[A-Z0-9]/u.test(c) ? 10.5 : 8.6;
    const width = word => Array.from(word).reduce((n,c)=>n+charWidth(c),0);
    for (const word of words) {
      if (current && used + 4 + width(word) > max) { lines.push(current); current=''; used=0; }
      if (current) { current+=' '; used+=4; }
      for (const ch of word) {
        const increment = charWidth(ch);
        if (current && used + increment > max) { lines.push(current); current=''; used=0; }
        current += ch; used += increment;
      }
    }
    if (current || !lines.length) lines.push(current);
    return lines;
  }

  const rows = cfg.lanes.map(([id,label,color]) => ({
    id, label, color:escape(color || accent), lines:laneLines(label), total:0, overdue:0,
    groups:new Map(), earlier:0
  }));
  const byLane = new Map(rows.map(row => [row.id,row]));
  let hasEarlier = false;
  for (const item of items) {
    const row = byLane.get(item.lane);
    if (!row || !item.due || !Number.isFinite(item.due.getTime())) continue;
    const day = calendarDay(item.due), overdue = !item.done && item.overdueEligible !== false && day < now;
    if (day < first) {
      if (overdue) { row.earlier++; hasEarlier=true; }
      continue;
    }
    if (day > last) continue;
    const stamp = item.due.getTime();
    if (!row.groups.has(stamp)) {
      row.groups.set(stamp,{date:item.due,day,stamp,count:0,overdue:0,done:0});
    }
    const group = row.groups.get(stamp);
    group.count++; group.overdue+=Number(overdue); group.done+=Number(Boolean(item.done));
    row.total++; row.overdue+=Number(overdue);
  }

  const plotStart = tableRight + (hasEarlier ? 74 : 2);
  const dayWidth = (right - plotStart) / (last - first + 1);
  const boundary = day => plotStart + (day - first) * dayWidth;
  const dayX = day => boundary(day) + dayWidth/2;
  let bottom = rowTop;
  const pointRadius = n => n<=1 ? 5.8 : Math.max(9.3, 3.5*String(n).length+4);
  for (const row of rows) {
    // Keep room for the numbered markers and vertical staggering in dense lanes.
    const largestMarker = Math.max(pointRadius(row.earlier), ...Array.from(
      row.groups.values(), group => pointRadius(group.count) * (group.overdue ? 1.1 : 1)
    ));
    row.height = Math.max(34, row.lines.length * 17 + 10, Math.ceil(largestMarker * 2 + 20));
    row.y = bottom + row.height / 2;
    bottom += row.height;
  }
  const totalsTop = bottom + 6, height = bottom + (hasEarlier ? 49 : 42);
  const parts = ['<svg class="ql-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+height+
    '" width="'+W+'" height="'+height+'" role="group" aria-label="'+escape(cfg.title+' for '+quarter)+'">'];
  parts.push(rect(0,0,W,height,paper), rect(left,headerTop,tableRight-left,bottom-headerTop,'var(--ql-wash,var(--surface-2))'),
    text(left+13,34,'Lane',14,ink,600),text(countX,26,'In',13,muted,500,'end'),
    text(countX,42,'quarter',13,muted,500,'end'),text(overdueX,34,'Overdue',13,muted,500,'end'),
    line(tableRight,headerTop,tableRight,bottom,rule));
  if (hasEarlier) {
    parts.push(rect(tableRight+1,headerTop,72,bottom-headerTop,'var(--ql-earlier-bg,var(--warn-bg))'),
      text(tableRight+37,34,'Earlier',13,'var(--ql-earlier-ink,var(--warn))',600,'middle','ql-earlier-label'),
      line(plotStart-1,headerTop,plotStart-1,bottom,rule));
  }

  for (let i=0;i<3;i++) {
    const monthDate = new Date(start.getFullYear(), start.getMonth()+i, 1);
    const nextMonth = new Date(start.getFullYear(), start.getMonth()+i+1, 1);
    const startDay = calendarDay(monthDate), x = boundary(startDay);
    const width = (calendarDay(nextMonth)-startDay)*dayWidth;
    const fill = i % 2 ? 'var(--ql-month-b,var(--accent-soft))' : 'var(--ql-month-a,var(--surface-2))';
    parts.push(rect(x,headerTop,width,26,fill),
      text(x+width/2,headerTop+18,labelMonth.format(monthDate),15,ink,600,'middle','ql-month'));
    if (i) parts.push(line(x,headerTop,x,bottom,rule));
    for (const num of [1,15]) {
      const tick = dayX(startDay+num-1);
      if (num===15) parts.push(line(tick,rowTop,tick,bottom,grid,1,'2 4'));
      parts.push(text(tick+(num===1?3:0),rowTop-7,num,12,muted,500,num===1?'start':'middle','ql-day'));
    }
  }
  parts.push(line(left,rowTop,right,rowTop,rule,1.4));
  for (const row of rows) parts.push(line(left,row.y+row.height/2,right,row.y+row.height/2,grid));
  parts.push(line(left,bottom,right,bottom,rule));
  if (now>=first && now<=last) {
    const tx = dayX(now), tw = 57;
    const tagX = Math.min(right-tw,Math.max(plotStart,tx-tw/2));
    parts.push(line(tx,rowTop,tx,bottom,accent,1.5,'4 3'), line(tx,bottom,tx,bottom+6,accent),
      rect(tagX,bottom+6,tw,21,accent,3),
      text(tagX+tw/2,bottom+21,'TODAY',11,'var(--ql-on-accent,var(--surface-solid))',650,'middle','ql-today'));
  }

  function marker(row,group,x,y,earlier=false) {
    const n = group.count, r = pointRadius(n);
    const state = group.overdue ? 'overdue' : group.done===n ? 'completed' : 'scheduled';
    const key = row.id+'|'+(earlier?'earlier':group.stamp);
    const label = (earlier?'Before this quarter':labelDate.format(group.date))+', '+row.label+', '+
      n+(n===1?' event':' events')+', '+(group.overdue?group.overdue+' overdue':state);
    const klass = 'tl-b ql-point ql-'+state+(earlier?' ql-earlier-point':'')+(state==='completed'?' done':'');
    const pieces = ['<g class="'+klass+'" tabindex="0" role="button" data-k="'+escape(key)+'" data-state="'+state+
      '" data-count="'+n+'" aria-label="'+escape(label)+'" transform="translate('+fmt(x)+' '+fmt(y)+')">',
      circle(Math.max(10,r+4),'transparent','none',0,'ql-hit')];
    if (state==='overdue') {
      const a=fmt(r*1.1);
      pieces.push('<path class="plot-mark ql-mark" d="M0 -'+a+'L'+a+' 0L0 '+a+'L-'+a+
        ' 0Z" fill="'+overdueInk+'" stroke="'+paper+'" stroke-width="1.15"/>');
    } else if (state==='completed') {
      pieces.push(circle(r,paper,row.color,1.9,'plot-mark ql-mark'));
      if (n===1) pieces.push('<path d="M-2.7 .1l1.9 1.9 3.8-4" fill="none" stroke="'+row.color+
        '" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>');
    } else {
      pieces.push(circle(r,row.color,paper,1.15,'plot-mark ql-mark'));
    }
    if (n>1) {
      const color = state==='overdue' ? 'var(--ql-on-overdue,var(--plot-over-ink))' :
        state==='completed' ? row.color : 'var(--ql-on-point,var(--plot-point-ink))';
      pieces.push(text(0,3.4,n,10,color,700,'middle','ql-quantity'));
    }
    pieces.push('</g>');
    return pieces.join('');
  }

  for (const row of rows) {
    parts.push('<g class="ql-lane" data-lane="'+escape(row.id)+'" data-total="'+row.total+'" data-overdue="'+row.overdue+'">');
    row.lines.forEach((label,i) => parts.push(text(left+13,row.y+5+(i-(row.lines.length-1)/2)*17,
      label,15,ink,600,'start','ql-lane-label')));
    parts.push(text(countX,row.y+6,row.total,18,ink,650,'end','ql-lane-count'),
      text(overdueX,row.y+6,row.overdue,17,row.overdue?overdueInk:muted,row.overdue?650:450,'end','ql-lane-overdue'));
    if (row.earlier) parts.push(marker(row,{count:row.earlier,overdue:row.earlier},tableRight+37,row.y,true));

    // Offset only in y. Close dates retain their real x coordinates and independent hit targets.
    const placed=[];
    const offsetMax = Math.min(14,row.height/4);
    const offsets = [0,-offsetMax,offsetMax,-offsetMax/2,offsetMax/2];
    for (const group of [...row.groups.values()].sort((a,b)=>a.stamp-b.stamp)) {
      const x = dayX(group.day), r = pointRadius(group.count) * (group.overdue?1.1:1);
      const clearance = offset => placed.reduce((gap,p)=>
        Math.min(gap,Math.hypot(x-p.x,offset-p.offset)-p.r-r),Infinity);
      const offset = offsets.find(o=>clearance(o)>=1.6) ??
        offsets.reduce((a,b)=>clearance(b)>clearance(a)?b:a,0);
      placed.push({x,r,offset});
      parts.push(marker(row,group,x,row.y+offset));
    }
    parts.push('</g>');
  }
  const total=rows.reduce((n,row)=>n+row.total,0), late=rows.reduce((n,row)=>n+row.overdue,0);
  parts.push('<g class="ql-totals" data-total="'+total+'" data-overdue="'+late+'">',
    rect(left,totalsTop,tableRight-left,29,'var(--ql-total-bg,var(--accent-soft))'),
    text(left+13,totalsTop+19,'Quarter total',14,ink,650),
    text(countX,totalsTop+20,total,17,ink,650,'end'),
    text(overdueX,totalsTop+20,late,17,late?overdueInk:ink,650,'end'),'</g>');
  if (hasEarlier) parts.push(text(right,bottom+42,'Earlier items are excluded from quarter totals.',13,muted,400,'end','ql-earlier-note'));
  parts.push('</svg>');
  return parts.join('');
}
