// One session-storage commit persists both command effects and their replay receipt.
// This models Demo persistence only; it does not stand in for Mongo recovery tests.
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
export function commandRequest(db, path, clientId, key, body, execute) {
  if (typeof key !== 'string' || key.length < 1 || key.length > 128)
    throw Object.assign(new Error('A request ID is required for this command'), {status:422,create_rejected:true});
  if ((path.startsWith('/onboarding/')||path==='/frameworks/cis-ig1/configuration') && !/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw Object.assign(new Error('Invalid Idempotency-Key'), {status:422,create_rejected:true});
  const scope = JSON.stringify([db.user.user_id,clientId,path,key]);
  const fingerprint = stable(body), prior = db.command_requests?.[scope];
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw Object.assign(new Error('This create request has different data; restore the original request before retrying'), {status:409});
    return JSON.parse(JSON.stringify(prior.result));
  }
  let result;
  try { result=execute(); }
  catch(error) {
    // These synchronous effects are still local: the adapter has not saved yet.
    if(error.status===422)error.create_rejected=true;
    throw error;
  }
  db.command_requests ||= {};
  db.command_requests[scope] = {fingerprint,result:JSON.parse(JSON.stringify(result))};
  return result;
}
