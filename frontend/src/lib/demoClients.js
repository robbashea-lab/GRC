// Presentation metadata for existing fictional identities; membership never grants access.
export const CIS_SHOWCASE_VERSION = 'cis81-showcase-v2';
export const NAMED_DEMO_CLIENTS = Object.freeze([
  {clientId:'demo_brawndo', name:'Brawndo', group:1, logo:'brawndo', historyVersion:'brawndo-cis-ig1-history-v2'},
  {clientId:'demo_initech', name:'Initech', group:2, logo:'/client-logos/initech.svg', historyVersion:'cis81-standard-demo-v1'},
  {clientId:'demo_krusty_krab', name:'The Krusty Krab', group:3, logo:'/client-logos/krusty-krab.svg', historyVersion:'cis81-standard-demo-v1'},
  {clientId:'demo_dunder', name:'Dunder Mifflin', logo:'/client-logos/dunder-mifflin.svg'},
  {clientId:'demo_prestige', name:'Prestige Worldwide', logo:'/client-logos/prestige-worldwide.svg'},
].map(client => Object.freeze({...client, historyVersions: Object.freeze(client.group
  ? [client.historyVersion, CIS_SHOWCASE_VERSION] : [])})));

export const namedDemoClient = clientId => NAMED_DEMO_CLIENTS.find(row => row.clientId === clientId);
