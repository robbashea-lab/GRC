import {ChevronRight, UserRound} from 'lucide-react';
import {ClientMark} from '@/components/EnhancedPortfolioShared';
import {grcLead} from '@/lib/clientRelationships';
import {programIdentity} from '@/lib/portfolioProgress';

export default function PortfolioDirectoryTable({clients, programs, onOpen, empty}) {
  const byClient = new Map();
  for (const program of programs) {
    if (!byClient.has(program.client_id)) byClient.set(program.client_id, []);
    byClient.get(program.client_id).push(program);
  }
  return <section className="panel v3-directory-panel" aria-label="Client directory">
    <table className="portfolio-directory" aria-label="Client portfolio">
      <colgroup><col /><col /><col /><col /></colgroup>
      <thead><tr>{['Client', 'Frameworks', 'GRC lead', 'Industry'].map(label =>
        <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{clients.length ? clients.map(client => {
        const frameworks = byClient.get(client.client_id) || [];
        const lead = grcLead(client);
        const assigned = Boolean(client.assigned_owner_id);
        const initials = lead.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('');
        return <tr key={client.client_id} className="portfolio-directory-row" data-client-id={client.client_id}>
          <td><button className="portfolio-client-open" type="button" aria-haspopup="dialog" aria-label={`Open ${client.name} overview`} onClick={event => onOpen(client, event)}>
            <ClientMark client={client} /><span className="client-name">{client.name}</span>
          </button></td>
          <td><span className="portfolio-frameworks">{frameworks.length ? frameworks.map(program =>
            <span className="portfolio-framework chip" key={programIdentity(program)}>{program.program_label}</span>) : <span className="sub">No framework assigned</span>}</span></td>
          <td><span className={`portfolio-client-lead${assigned ? '' : ' sub'}`}>
            <span className={`av${assigned ? '' : ' none'}`} aria-hidden="true">{assigned ? initials : <UserRound size={13} />}</span>{lead.name}
            {lead.notice && <span className="sr-only">{lead.notice}</span>}
          </span></td>
          <td><span className="portfolio-client-industry"><span className="portfolio-industry-text sub">{client.industry || <><span className="sr-only">Industry not set</span><span aria-hidden="true">—</span></>}</span>
            <span className="portfolio-directory-chevron" aria-hidden="true"><ChevronRight size={16} /></span></span></td>
        </tr>;
      }) : <tr><td colSpan={4} className="ep-empty empty">{empty}</td></tr>}</tbody>
    </table>
  </section>;
}
