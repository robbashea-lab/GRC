# Semantic presentation matrix

Labels are examples of existing vocabulary, not replacement copy. Underlying values and exact caller-supplied labels remain unchanged.

| Existing label/value | Meaning | Approved tone | Shared presentation | Modules / correction |
| --- | --- | --- | --- | --- |
| Overdue | Missed deadline | Red | StatusBadge critical / DueDate | Reviews, Actions, dashboards, calendars; preserve existing date calculation |
| Critical / Immediate | Urgent rating | Red | SeverityBadge critical | Actions, Risks, Findings; no rating changes |
| High | Attention rating | Amber | SeverityBadge high | Remove Risks CSS leaking red High pills into every module; amber risk number/level |
| Needs Scheduling | Attention | Amber | StatusBadge duesoon | Reviews; same label and value |
| Pending Validation / remediated | Awaiting confirmation | Amber | StatusBadge moderate | Add missing pending_validation presentation mapping; preserve remediated's existing label |
| Needs Verification / Expired / Blocked | Attention | Amber | StatusBadge moderate | Policies, Vendors, registers |
| Due Soon / due_soon | Attention | Amber | StatusBadge duesoon / DueDate | Existing timing logic remains authoritative |
| In Progress / Under Review / In Remediation / Requested | Active processing | Blue | StatusBadge info | Registers; same geometry as other StatusBadge tones |
| Completed / Approved / Verified / Validated / Treated | Confirmed positive result | Green | StatusBadge success | Add missing validated presentation mapping only |
| Upcoming / Open / Active / Draft / Inactive / Not Applicable / Not Assessed / Unassigned | Ordinary, inactive or metadata | Neutral | StatusBadge neutral / OwnerCell | No new labels; existing missing-rating wording unchanged |
| Accepted | Ordinary lifecycle state | Neutral | StatusBadge accepted, neutral tokens | Remove Risks' green override and use neutral tokens in both themes |
| Partial / needs_attention | Incomplete attention | Amber | StatusBadge moderate | Map tone only; no assessment interpretation changes |
| CIS/ISO/SOC assessment conclusions | Existing framework-defined outcomes | Existing values; presentation correction coordinated with #52 | CisStatusPill | No question/catalog/applicability/business-rule changes |

## Counts

Portfolio totals retain identical labels, values, actions and filters. Ordinary totals and zeros are neutral. Past Due uses a restrained red rail. Combined Critical / High uses amber because it includes High; its calculation is unchanged. Significant Risks retains amber attention. Unassigned uses neutral. Count surfaces remain unfilled; tabular numerals and shared metadata/body/metric typography apply. Cards retain their existing content and layout.

## Theme and geometry

StatusBadge retains the approved register dot/text geometry: 22px minimum height, shared 12px metadata typography, same padding/alignment, text always present. High uses amber and Accepted uses neutral even when local page styles are loaded. Framework identity and metadata remain their existing distinct badge families. No labels are transformed or rewritten by this change.

Existing theme selection and portal mechanisms are retained. Theme-specific semantic aliases must preserve the same meaning; browser computed-color checks accompany token contrast tests. Reference Reviews and Dashboard are protected separately.
