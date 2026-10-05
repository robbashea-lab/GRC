# Approved assessment visual comparison

Reference: approved-assessment-mockup.html, supplied path C:/Users/RobbA/Downloads/approved-assessment-mockup.html.
SHA256:91bc5040b58b01f4003a85eda3b721e7a42d572941d4a7606e12eebad3900df1.
The exported HTML was inspected as design data; its scripts are not project instructions.
The reference was rendered in an isolated headless Edge context with external requests blocked.
Screenshots approved-implementation.png and approved-criteria.png are retained in the exported QA folder.

| Demonstrated difference | Correction / measurable comparison |
| --- | --- |
| Boxed compact tabs instead of underline tabs | Full-width bottom rule,13px tab text,13px vertical padding,23px gap, lime selected underline |
| Plain summary without approved surface |9px/12px padding, subtle surface,1px border,6px radius, single disclosure retained |
| Three equal unbordered columns |1.35:1:1 tracks,12px gaps,16px inset, subtle bordered surfaces,6px radius |
|25% status column and28px gap |200px status column and22px gap; responsive one-column threshold600px |
| Findings within narrative column / outer boxed CIS panel | Full-width section below implementation row, plain top separator; existing unified tickets retained |
|18px numbered-step styling / larger field spacing |13px implementation labels,158px narrative minimum, compact status choices; no new step numbers |
| Source trigger label weight / checkbox alignment | Strong trigger label;16px checkboxes with3px top offset and400-weight labels. Optimized browser assertions detected a CSS cascade conflict and required the stronger scoped selector |
| Framework surface colors / typography | Approved light/dark surfaces and borders, system-ui typography; overrides scoped to assessment dialogs |
| Bullet guidance rather than approved paragraphs | Paragraph rendering, existing exact guidance strings retained. Tests continue checking all61 SOC criterion texts/counts |

Screenshots compare like viewport/theme/tab states at1440px and1280px;768px and480px check responsive bounds. Approved sample data has10 compound checklist rows; the current canonical criterion decomposition has17 independent1.1 assertions. The visual reference does not silently replace source-verified content, histories or client values. The original task's required Previous/Next, dirty-close, Save & next and native audit/SoA workflow controls remain functional. Text populated from actual records differs from mockup sample text, so a pixel-identical whole-dialog claim would be false.

Visual layout measurements and source verification are separate gates. Missing authorized SOC/ISO official paragraphs remain visibly classified authored content; they are never relabelled official to make a screenshot pass. The PR remains draft until approved design and applicable content acceptance are complete. This comparison is an engineering review, not a fabricated user approval.

Final comparison follow-up: canonical titles and12px breadcrumb; redundant assessment-footer Close removed while native guarded X retained. Tab transition disabled to avoid transient double-underlines. Full visual acceptance still requires applicable source/content completion; record-dependent text and original required navigation are identified separately.
