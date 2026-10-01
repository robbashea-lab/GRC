// DEMO - SYNTHETIC DATA. Client program modules for the Demo seed.
//
// Brawndo keeps its validated reference tables (../brawndoProgram.js). Other clients supply a
// module with this shape; anything omitted falls back to the generic seed. All days are relative
// to the seed date (D0): `ago` values are days in the past, `in` values days ahead (negative =
// already past due). Person indexes: 0 = client GRC manager, 1 and 2 = contributors (the three
// people who own work). The departed employee and provider lead are handled by the seed.
//
// {
//   framework: 'iso-27001' | 'soc-2',
//   soc?: { categories: ['security', ...], system_description, period_start_ago, period_end_in },
//   profile?: { organization?: {...}, technical?: {...}, security?: {...} }   // shallow-merged per section
//   assessments: {
//     [definitionId]: {
//       status: 'addressed' | 'in_progress' | 'needs_attention' | 'not_assessed' | 'not_applicable',
//       assessed_ago: number | null,          // null = never assessed (history empty)
//       owner: 0 | 1 | 2,
//       technology: string, narrative: string, // the operator's own words, never framework text
//       evidence_ago: number | null,           // age of one linked validation record, null = none
//       soa?: 'included' | 'excluded' | '',   // ISO Annex A only; '' = undetermined. excluded => not_applicable
//       justification?: string,               // ISO Annex A: required when soa is set
//       controls?: [{ control_id, name, description, owner, frequency, design, operating,
//                     expected, collected, population_notes, testing_notes }],   // SOC only, 1-3 per criterion
//     }
//   },
//   findings: [{ definition, title, severity, description, action, assignee, due_in, age,
//                closed_ago? }],       // raised from assessment gaps; closed_ago => validated and closed
//   review_findings: [{ title, action }],   // exactly 4: raised from completed Reviews
//   risks: [{ title, description, category, likelihood, impact, status, treatment, plan, owner,
//             reviewed_ago, next_in, acceptance?: { rationale, ago, expires_in },
//             closure?: { ago, reason, rationale } }],
//   vendors: [{ name, services, criticality, data_types, owner, last_review_ago, next_review_in,
//               renewal_in, assurance: { type, received_ago, refresh_in }, notes }],
// }
import prestige from './prestige';

export const CLIENT_PROGRAMS = { demo_prestige: prestige };
export const clientProgram = cid => CLIENT_PROGRAMS[cid] || null;
