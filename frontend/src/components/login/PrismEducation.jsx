import { useEffect, useRef, useState } from "react";
import { GovernanceContent, RiskContent, ComplianceContent } from "./prismContent";

const TOPICS = ["governance", "risk", "compliance"];
const LABELS = { governance: "Governance", risk: "Risk", compliance: "Compliance" };
const CONTENT = { governance: GovernanceContent, risk: RiskContent, compliance: ComplianceContent };

export default function PrismEducation() {
  const [topic, setTopic] = useState(null);
  const [framework, setFramework] = useState("soc");
  const [stage, setStage] = useState("inherent");
  const dialog = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    if (topic) {
      if (!element.open) element.showModal();
      element.scrollTop = 0;
      element.querySelector(`#tab-${topic}`).focus();
    } else if (element.open) element.close();
  }, [topic]);

  function openTopic(next, trigger) {
    if (!TOPICS.includes(next)) return;
    if (trigger) returnFocus.current = trigger;
    setFramework("soc");
    setStage("inherent");
    setTopic(next);
  }

  function close() {
    setTopic(null);
    returnFocus.current?.focus();
  }

  function select(event) {
    const button = event.target.closest("button");
    if (!button || !event.currentTarget.contains(button)) return;
    if (button.dataset.topic) openTopic(button.dataset.topic);
    if (["soc", "iso", "ig1", "ig2", "ig3"].includes(button.dataset.framework)) setFramework(button.dataset.framework);
    if (["inherent", "residual", "target"].includes(button.dataset.stage)) setStage(button.dataset.stage);
  }

  function navigateTabs(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = TOPICS.indexOf(topic);
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    openTopic(TOPICS[next]);
    dialog.current.querySelector(`#tab-${TOPICS[next]}`).focus();
  }

  function keepFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), a[href], summary')]
      .filter(element => element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  const current = topic || "governance";
  const TopicContent = CONTENT[current];
  const index = TOPICS.indexOf(current);
  const previous = TOPICS[(index + 2) % 3];
  const next = TOPICS[(index + 1) % 3];

  return <>
    <section className="cards" aria-label="Explore governance, risk, and compliance">
      {TOPICS.map((key, i) => <button type="button" className="card" data-topic={key} key={key} onClick={event => openTopic(key, event.currentTarget)}>
        <h2>{LABELS[key]}</h2><p>{["Direction & accountability", "Visibility & response", "Evidence & assurance"][i]}</p>
        <span className="explore">Explore <span aria-hidden="true">→</span></span>
      </button>)}
    </section>
    <dialog className="modal" id="explorer" ref={dialog} aria-labelledby="topicTitle" onClose={close} onKeyDown={keepFocus}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current.close();
      }}>
      <header className="modalhead">
        <div><div className="eyebrow" style={{ marginBottom: 10 }}>Explore your security program</div>
          <nav className="tabs" role="tablist" aria-label="GRC topics" onClick={select} onKeyDown={navigateTabs}>
            {TOPICS.map(key => <button type="button" role="tab" id={`tab-${key}`} data-topic={key} aria-controls="content"
              aria-selected={key === current} tabIndex={key === current ? 0 : -1} key={key}>{LABELS[key]}</button>)}
          </nav>
        </div>
        <button type="button" className="close" id="close" aria-label="Close overview" onClick={() => dialog.current.close()}>×</button>
      </header>
      <article className="body" id="content" role="tabpanel" aria-labelledby={`tab-${current}`} onClick={select} key={current}>
        <TopicContent stage={stage} framework={framework} />
        <div className="end">
          <button type="button" data-topic={previous}>← {LABELS[previous]}</button>
          <button type="button" data-topic={next}>{LABELS[next]} →</button>
        </div>
      </article>
    </dialog>
  </>;
}
