import { useEffect, useRef, useState } from "react";
import { GoverNaraIcon } from "./GoverNaraGraphics";

export const GOVERNARA_TOPICS = {
  governance: {
    title: "Governance", subtitle: "With purpose.",
    definition: "Governance sets the direction for your program: who makes decisions, who owns the work, and how responsibilities are put into practice.",
    why: "Clear priorities and accountability help teams make consistent decisions instead of relying on assumptions or disconnected processes.",
    people: "Leadership sets direction. Program owners coordinate the work. Teams carry out their assigned responsibilities.",
    workspace: "Bring policies, ownership, reviews, and follow-up actions into a connected view of your program.", next: "risk",
  },
  risk: {
    title: "Risk", subtitle: "With insight.",
    definition: "Risk management helps you understand what could go wrong, how it could affect the organization, and what you will do about it.",
    why: "A clear view of likelihood, impact, and existing safeguards helps you decide where attention and resources are needed most.",
    people: "Risk owners assess and manage their risks. Specialists advise on options. Leadership makes or approves decisions within its authority.",
    workspace: "Document risks, assign owners, connect treatment actions, and revisit decisions as your organization changes.", next: "compliance",
  },
  compliance: {
    title: "Compliance", subtitle: "With confidence.",
    definition: "Compliance means understanding the requirements that apply to your organization and maintaining practices and records that demonstrate how you address them.",
    why: "A structured approach makes requirements easier to follow, gaps easier to identify, and supporting evidence easier to find.",
    people: "Control owners maintain practices and evidence. The GRC team coordinates assessments. Leadership provides oversight and resources.",
    workspace: "Work through requirements, record implementation, connect evidence, and track findings and follow-up work. Implementation and verification remain separate.", next: "governance",
  },
};
const TOPICS = Object.keys(GOVERNARA_TOPICS);

export default function GoverNaraEducation() {
  const [topic, setTopic] = useState(null);
  const dialog = useRef(null);
  const opener = useRef(null);
  const isOpen = topic !== null;
  const current = GOVERNARA_TOPICS[topic || "governance"];

  function close() {
    setTopic(null);
    opener.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    if (!element.open) element.showModal();
    document.body.style.overflow = "hidden";
    element.querySelector(".icon-button").focus();
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!topic) return undefined;
    const element = dialog.current;
    element.scrollTop = 0;
    function place() {
      if (window.innerWidth <= 900) {
        element.style.removeProperty("left");
        element.style.removeProperty("top");
        return;
      }
      const rect = opener.current.getBoundingClientRect();
      element.style.left = `${Math.max(18, Math.min(rect.left - 4, window.innerWidth - element.offsetWidth - 22))}px`;
      element.style.top = `${Math.max(18, Math.min(rect.bottom + 18, window.innerHeight - element.offsetHeight - 22))}px`;
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [topic]);

  function keepFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll("button:not([disabled])")];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  function navigateTopics(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = TOPICS.indexOf(topic);
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    setTopic(TOPICS[next]);
    dialog.current.querySelector(`[data-topic="${TOPICS[next]}"]`).focus();
  }

  return <>
    <header className="topbar">
      <div className="brand" aria-label="GoverNara"><GoverNaraIcon name="feather" className="feather" /><span className="brand-name">GoverNara</span></div>
      <nav className="nav-wrap" aria-label="Explore governance, risk and compliance">
        {TOPICS.map(key => <button className="topic-trigger" type="button" key={key} data-topic={key}
          aria-haspopup="dialog" aria-controls="governara-topic-dialog" aria-expanded={topic === key}
          onClick={event => { opener.current = event.currentTarget; setTopic(key); }}>
          {GOVERNARA_TOPICS[key].title}<GoverNaraIcon name="plus" />
        </button>)}
      </nav>
      <div className="top-motto">A clearer path through GRC.</div>
    </header>
    <dialog className="explainer" id="governara-topic-dialog" ref={dialog} aria-labelledby="governara-topic-title"
      aria-describedby="governara-topic-definition" onClose={close} onKeyDown={keepFocus}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}>
      <div className="dialog-top"><p className="dialog-kicker">Three disciplines. One connected program.</p>
        <button className="icon-button" type="button" aria-label="Close information panel" onClick={close}><GoverNaraIcon name="close" /></button>
      </div>
      <nav className="topic-tabs" aria-label="Information topics" onKeyDown={navigateTopics}>
        {TOPICS.map(key => <button className="topic-tab" type="button" key={key} data-topic={key}
          aria-pressed={topic === key} onClick={() => setTopic(key)}>{GOVERNARA_TOPICS[key].title}</button>)}
      </nav>
      <div className="topic-content">
        <div className="topic-title-row"><span className="topic-emblem"><GoverNaraIcon name={topic || "governance"} /></span>
          <div><h2 id="governara-topic-title">{current.title}</h2><p className="topic-subtitle">{current.subtitle}</p></div>
        </div>
        <p className="topic-definition" id="governara-topic-definition">{current.definition}</p>
        <div className="topic-grid"><section><h3 className="small-heading">Why it matters</h3><p>{current.why}</p></section>
          <section><h3 className="small-heading">Who's responsible</h3><p>{current.people}</p></section></div>
        <section className="workspace-line"><h3 className="small-heading">In GoverNara</h3><p>{current.workspace}</p></section>
      </div>
      <div className="topic-footer"><p className="topic-footnote">Clear responsibilities. Informed decisions.<br />Work that stays connected.</p>
        <button type="button" className="text-button next-topic" onClick={() => setTopic(current.next)}>
          <span>Explore {GOVERNARA_TOPICS[current.next].title.toLowerCase()}</span><GoverNaraIcon name="arrow" />
        </button>
      </div>
    </dialog>
  </>;
}
