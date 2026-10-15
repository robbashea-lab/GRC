const DAY = 86400000;
const STATUS_KEYS = ['addressed', 'in_progress', 'needs_attention', 'not_assessed'];
const position = value => value?.current ? {...value.current, ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'current'))} : value;
const time = value => Date.parse(value);

export const programIdentity = program => program.program_id || JSON.stringify([program.client_id, program.program_key]);
export const snapshotTime = snapshot => position(snapshot)?.effective_at || position(snapshot)?.captured_at || position(snapshot)?.at;

export function applicableCounts(snapshot) {
  const current = position(snapshot);
  const values = current?.included_counts || current?.counts;
  if (!Array.isArray(values)) return [];
  return values.filter(value => STATUS_KEYS.includes(value.key)).sort((a, b) => STATUS_KEYS.indexOf(a.key) - STATUS_KEYS.indexOf(b.key));
}

function validPosition(snapshot) {
  const current = position(snapshot), counts = applicableCounts(current);
  return !!current && current.availability !== 'unavailable' && current.availability !== 'partial'
    && !current.unrecognized_status_count && !current.missing_records
    && !current.duplicate_records && !current.invalid_applicability?.length
    && Number.isInteger(current.denominator) && current.denominator >= 0
    && Number.isInteger(current.implemented) && current.implemented >= 0
    && counts.length === STATUS_KEYS.length && new Set(counts.map(value => value.key)).size === STATUS_KEYS.length
    && counts.every(value => Number.isInteger(value.count) && value.count >= 0)
    && counts.reduce((sum, value) => sum + value.count, 0) === current.denominator
    && counts[0].count === current.implemented;
}

export {validPosition as validImplementationPosition};

export function currentPercentage(snapshot) {
  const current = position(snapshot);
  return validPosition(current) && current.denominator > 0 ? current.implemented / current.denominator * 100 : null;
}

// Calendar ranges and daily forecast votes use UTC, matching persisted platform events.
export function calendarRangeStart(asOf, months) {
  const at = new Date(asOf);
  if (!Number.isFinite(at.getTime()) || ![1, 3, 6, 12, 36].includes(Number(months))) return null;
  const day = at.getUTCDate();
  at.setUTCDate(1);
  at.setUTCMonth(at.getUTCMonth() - Number(months));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate();
  at.setUTCDate(Math.min(day, end));
  return at.toISOString();
}

export function historyWindow(snapshots = [], start, asOf, comparison = null) {
  const first = time(start), last = time(asOf);
  const points = snapshots.map(position).filter(snapshot => time(snapshotTime(snapshot)) >= first && time(snapshotTime(snapshot)) <= last)
    .sort((a, b) => time(snapshotTime(a)) - time(snapshotTime(b)) || time(a.captured_at) - time(b.captured_at));
  const baseline = position(comparison?.baseline);
  if (comparison?.baseline_effective_at_start === true && baseline && time(snapshotTime(baseline)) < first) {
    points.unshift({...baseline, carried: true, display_at: start});
  }
  return points;
}

export function periodChange(snapshots, current, start, options = {}) {
  const source = options.comparison;
  const baseline = source != null ? source.baseline?.current || source.baseline || null : [...(snapshots || [])].map(position)
    .filter(snapshot => time(snapshotTime(snapshot)) <= time(start)).sort((a, b) => time(snapshotTime(b)) - time(snapshotTime(a)))[0];
  const scopeChanged = !!(source?.scope_changed || options.scopeChanges?.length || baseline && baseline.scope_signature !== position(current)?.scope_signature);
  const unavailable = reason => ({comparable: false, change_pp: null, change_count: null, baseline: baseline || null, reason, scope_changed: scopeChanged});
  if (!baseline) return unavailable(source?.reason || 'No trustworthy position is available at the start of this period.');
  const proven = source?.baseline_effective_at_start === true || options.baselineEffective === true
    || time(snapshotTime(baseline)) === time(start);
  if (!proven) return unavailable(source?.reason || 'An earlier sampled position does not prove the state at the period boundary.');
  if (source?.comparable === false && !scopeChanged) return unavailable(source.reason || 'The retained positions are not comparable.');
  const before = currentPercentage(baseline), after = currentPercentage(current);
  if (before == null || after == null) return unavailable('Implementation is unavailable for one of the period positions.');
  return {comparable: true, change_pp: after - before, change_count: position(current).implemented - baseline.implemented,
    baseline, scope_changed: scopeChanged, reason: scopeChanged ? 'Scope changed; each position uses its own applicable denominator.' : ''};
}

export function forecastImplementation(snapshots = [], snapshot, asOf, options = {}) {
  const current = position(snapshot), at = time(asOf);
  const verb = options.verb || 'implemented';
  const unavailable = reason => ({ok: false, label: 'Not estimated', reason, note: reason, days: null, slope: null, monthly_pace: null});
  if (!Number.isFinite(at) || !validPosition(current)) return unavailable('Current implementation data is invalid or unavailable.');
  if (![current.scope_signature, current.measure_version, current.source_revision].every(value => typeof value === 'string' && value.length > 0)) return unavailable('The current scope, measurement version or source revision is unavailable.');
  if (!current.denominator) return unavailable('No applicable scope.');
  if (current.implemented === current.denominator) return {ok: true, label: `Fully ${verb}`, note: `All ${current.denominator} applicable items are ${verb}.`, days: 0, slope: null, monthly_pace: null};
  const cut = at - 90 * DAY;
  const observations = snapshots.map(position).filter(value => {
    const observed = time(snapshotTime(value));
    return validPosition(value) && observed >= cut && observed <= at
      && typeof value.source_revision === 'string' && value.source_revision.length > 0
      && typeof value.scope_signature === 'string' && value.scope_signature.length > 0
      && typeof value.measure_version === 'string' && value.measure_version.length > 0
      && Number.isFinite(time(value.captured_at)) && time(value.captured_at) <= at;
  }).sort((a, b) => time(snapshotTime(a)) - time(snapshotTime(b)) || time(a.captured_at) - time(b.captured_at));
  const genuine = observations.filter(value => ['committed_event', 'committed_baseline'].includes(value.observation_kind));
  const scopeEvents = options.scopeChanges || [];
  const explicitChange = Math.max(cut, ...scopeEvents.map(event => time(event.effective_at || event.at)).filter(value => Number.isFinite(value) && value <= at));
  let reset = explicitChange;
  for (const value of observations) {
    if (value.scope_signature !== current.scope_signature || value.measure_version !== current.measure_version) reset = Math.max(reset, time(snapshotTime(value)));
  }
  const comparable = genuine.filter(value => time(snapshotTime(value)) >= reset && value.scope_signature === current.scope_signature && value.measure_version === current.measure_version);
  const latest = comparable.at(-1);
  if (!latest) return unavailable('No genuine committed history is available on the current scope.');
  const sameState = value => value.scope_signature === current.scope_signature && value.measure_version === current.measure_version
    && value.implemented === current.implemented
    && JSON.stringify(applicableCounts(value).map(count => count.count)) === JSON.stringify(applicableCounts(current).map(count => count.count))
    && (value.status_signature && current.status_signature ? value.status_signature === current.status_signature : value.source_revision === current.source_revision);
  if (!sameState(latest)) {
    return unavailable('Retained history does not yet match the current committed assessment state.');
  }
  const freshness = Math.max(...observations.filter(sameState).map(value => time(value.captured_at)), -Infinity);
  if (at - freshness > 30 * DAY) return unavailable('The latest trustworthy current capture is more than 30 days old.');
  const days = new Map();
  for (const value of comparable) days.set(new Date(snapshotTime(value)).toISOString().slice(0, 10), value);
  const votes = [...days.values()], firstAt = time(snapshotTime(votes[0]));
  if (votes.length < 3 || time(snapshotTime(votes.at(-1))) - firstAt < 60 * DAY) {
    return unavailable(reset > cut ? 'Scope changed. An estimate needs at least three genuine positions spanning 60 days after the change.'
      : 'An estimate needs at least three genuine positions spanning 60 days within the latest 90 days.');
  }
  const xs = votes.map(value => (time(snapshotTime(value)) - firstAt) / DAY), ys = votes.map(value => value.implemented);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length, meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const slope = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / denominator;
  if (!(denominator > 0) || !Number.isFinite(slope) || slope <= 0 || current.implemented <= ys[0]) return unavailable(`No positive net gain in ${verb} items over the comparable latest 90-day history.`);
  const remaining = (current.denominator - current.implemented) / slope, monthlyPace = slope * 30.44;
  if (!Number.isFinite(remaining) || !Number.isFinite(monthlyPace)) return unavailable('The estimate cannot be calculated from this history.');
  const beyond = remaining > 365.25 * 5;
  const estimatedAt = beyond ? null : new Date(at + remaining * DAY);
  if (estimatedAt && !Number.isFinite(estimatedAt.getTime())) return unavailable('The projected date is outside the supported date range.');
  const label = beyond ? 'Beyond 5 years' : 'Around ' + estimatedAt.toLocaleDateString(undefined, {month: 'short', year: 'numeric', timeZone: 'UTC'});
  return {ok: true, label, days: remaining, slope, monthly_pace: monthlyPace, estimated_at: estimatedAt?.toISOString() || null,
    note: `If the latest 90-day pace of +${monthlyPace.toFixed(1)} items per month continues and scope stays the same. Based on ${votes.length} genuine daily positions; this is an estimate, not a target date.`};
}

export const assignedToUser = (client, userId) => !!userId && (client.grc_lead_id === userId || client.assigned_owner_id === userId);

export function portfolioGroups(clients, programs, view, userId) {
  const query = (view.search || '').trim().toLocaleLowerCase();
  const groups = clients.filter(client => (client.status || 'active') !== 'archived' && (!view.mine || assignedToUser(client, userId))).map(client => {
    const enabled = programs.filter(program => program.client_id === client.client_id);
    const visible = enabled.filter(program => !view.framework || view.framework === 'all' || program.program_key === view.framework || program.framework_key === view.framework);
    const lead = typeof client.grc_lead === 'string' ? client.grc_lead : client.grc_lead?.name || client.grc_lead?.email || client.grc_lead_name || 'Unassigned';
    const text = [client.name, client.industry, lead, ...enabled.map(program => program.program_label)].join(' ').toLocaleLowerCase();
    return {client, programs: visible, match: !query || text.includes(query), enabled: enabled.length};
  }).filter(group => group.match && (group.programs.length || !group.enabled && (!view.framework || view.framework === 'all')));
  const numeric = (group, descending) => {
    const values = view.sort?.startsWith('progress')
      ? group.programs.map(program => currentPercentage(program.current))
      : view.sort?.startsWith('change')
        ? group.programs.map(program => program.comparison_90d?.baseline_effective_at_start ? program.comparison_90d.change_pp : null)
        : [time(group.client.last_activity?.at)];
    const known = values.filter(Number.isFinite);
    return known.length ? (descending ? Math.max(...known) : Math.min(...known)) : null;
  };
  const descending = view.sort?.endsWith('-desc');
  const numericSort = /^(progress|change|activity)/.test(view.sort || '');
  return groups.sort((a, b) => {
    if (numericSort) {
      const left = numeric(a, descending), right = numeric(b, descending);
      if (left == null && right != null) return 1;
      if (left != null && right == null) return -1;
      if (left != null && right != null && left !== right) return descending ? right - left : left - right;
    }
    const name = (a.client.name || '').localeCompare(b.client.name || '', undefined, {sensitivity: 'base'});
    return (view.sort === 'name-desc' ? -name : name) || a.client.client_id.localeCompare(b.client.client_id);
  }).map(({client, programs: visible}) => ({client, programs: visible}));
}
