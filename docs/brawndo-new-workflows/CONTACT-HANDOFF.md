# Contact workflow source checkpoint

Baseline and coordination: see `HANDOFF.md`. New presentation is activated only through existing trusted full-record eligibility plus exact `/contacts`. Contacts landing source is untouched. Ordinary clients and signed-in mode retain their native editor.

## Operation map

| Reference state | Native source/operation | Source status | Runtime/visual status |
| --- | --- | --- | --- |
| New contact, unique title/program-role labels | Existing contact form and native POST/create-intent | Implemented unique heading/input IDs | Not run/rendered |
| Overview, primary badge, dates | Actual Client primary ID, Contact created/email, authorized account projection | Implemented | Original light desktop captured; candidate pending |
| Owns/count/group rows | Existing user open_assignments, actual same-client IDs; native record GET/open | Implemented; truncation explicit, unverified counts never zero | Original captured; candidate/native journey pending |
| Platform access active/pending/no-access/disabled | Existing verified contact-accounts plus authorized Users projection | Implemented; unavailable sign-in is Not recorded | Original active captured; remaining states pending |
| Client role cards/capabilities | Existing role registry; native User PATCH with expected_updated_at | Implemented; no internal-role grant | Tests prepared, not run |
| Invite/resend | Existing explicit optional invitation and ContactAccountActions confirmation; native resend | Implemented; real Demo simulation feedback | Existing and new tests pending |
| Pending invitation cancellation target | User approved clearly labeled confirmed account-wide Disable access | Implemented using actual account/version and native ownership check | Native journey pending |
| Primary selection | Contact accepted first, then native Client PATCH/version; retained separate failure boundary | Implemented | Partial-failure regression prepared |
| Save/Cancel/discard/retry | Existing Contact create/update-intent, dirty/beforeunload/discard/uncertain retry | Retained; role dirty state survives context reload | Tests prepared, not run |
| Contact email versus sign-in identity | Contact PATCH only; actual account email displayed separately | Implemented | Test prepared |
| Archive/restore/history | Native projection recheck, confirmation and status PATCH/version | Retained and reflowed; no owned-work prerequisite added | Not run |
| Activity/changes/empty/error | Actual Contact activity; only known Contact change fields, real actor/time | Implemented; no fabricated history | Original captured; candidate pending |
| Loading/error/client switch/late response | Actor/client/contact/revision keyed requests and abort; response identity validation | Implemented, tests prepared | Not run |
| Read-only/client roles | No admin-only Users/ownership fetch; fields/actions follow native canWrite | Implemented, tests prepared | Not run |
| Dark/narrow/hover/focus/validation | Scoped reference tokens; native sheet shell; roving keyboard tabs | Source implemented | Candidate unrendered |

## Approved differences

User selected per-record Owns/Open reassignment instead of unsupported Reassign all, and confirmed account-wide Disable access instead of unsupported Cancel invite. Native ownership-retaining disable/archive rules remain; mock owned-count blockers are not imported. Contact email does not change login identity. Saved omitted phone/notes values survive. Separate Contact/Client/User writes are never described as atomic.

## Review and evidence

Independent Vendor source review identified pending-role dirty state disappearing while context reloads. Corrected with a retained account/role baseline; new regression covers accepted primary update followed by failed role write and dirty-close guard. Further source review added response-scope validation and late owned-record response rejection.

The exact reference font bytes match the existing local Inter file, SHA256 `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62`. Four face declarations match the original CSS (400/500/600/700); computed CSS alone does not prove rendered glyph parity. Original Contact light desktop screenshots are in the chat `outputs/visual-evidence/`, actual viewport1280×720, DPR1.5. No candidate pair exists yet. Do not report visual or operational acceptance.

Files: `ContactWorkspace.jsx`, new `BrawndoContactWorkflow.jsx/.css/.test.jsx`, new `useContactWorkflowData.js/.test.jsx`. No server, role registry, adapter, global CSS or Contacts landing change.

Next: serial test/build slot, run focused and affected native tests, serve exact candidate, capture matched tab/new/dirty/error/lifecycle/theme/responsive pairs and computed styles, verify real Demo create/edit/primary/invite/role/disable/archive/reload/link journeys and negative scope controls. No deployment authorized by this lane.
