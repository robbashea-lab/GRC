import React, { act } from "react";
import { createRoot } from "react-dom/client";
import GoverNaraEducation, { GOVERNARA_TOPICS } from "./GoverNaraEducation";

let container, root, previousOverflow;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // JSDOM models dialog events only; the coordinator checks the real native top layer.
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.open = false; this.dispatchEvent(new Event("close")); });
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "scroll";
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<GoverNaraEducation />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.body.style.overflow = previousOverflow; });
const click = selector => act(async () => container.querySelector(selector).click());
const key = async (element, name, shiftKey = false) => {
  const event = new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true, cancelable: true });
  await act(async () => element.dispatchEvent(event));
  return event;
};

test.each([
  ["governance", "With purpose.", "Governance sets the direction for your program: who makes decisions, who owns the work, and how responsibilities are put into practice.", "Clear priorities and accountability help teams make consistent decisions instead of relying on assumptions or disconnected processes.", "Leadership sets direction. Program owners coordinate the work. Teams carry out their assigned responsibilities.", "Bring policies, ownership, reviews, and follow-up actions into a connected view of your program."],
  ["risk", "With insight.", "Risk management helps you understand what could go wrong, how it could affect the organization, and what you will do about it.", "A clear view of likelihood, impact, and existing safeguards helps you decide where attention and resources are needed most.", "Risk owners assess and manage their risks. Specialists advise on options. Leadership makes or approves decisions within its authority.", "Document risks, assign owners, connect treatment actions, and revisit decisions as your organization changes."],
  ["compliance", "With confidence.", "Compliance means understanding the requirements that apply to your organization and maintaining practices and records that demonstrate how you address them.", "A structured approach makes requirements easier to follow, gaps easier to identify, and supporting evidence easier to find.", "Control owners maintain practices and evidence. The GRC team coordinates assessments. Leadership provides oversight and resources.", "Work through requirements, record implementation, connect evidence, and track findings and follow-up work. Implementation and verification remain separate."],
])("%s header entry opens exact approved public copy and restores the actual opener", async (topic, subtitle, definition, why, people, workspace) => {
  const opener = container.querySelector(`.topic-trigger[data-topic='${topic}']`);
  opener.focus(); await click(`.topic-trigger[data-topic='${topic}']`);
  expect(container.querySelector("dialog").open).toBe(true);
  expect(container.querySelector(".topic-subtitle").textContent).toBe(subtitle);
  expect(container.querySelector(".topic-definition").textContent).toBe(definition);
  expect(container.querySelector(".topic-grid section:first-child p").textContent).toBe(why);
  expect(container.querySelector(".topic-grid section:last-child p").textContent).toBe(people);
  expect(container.querySelector(".workspace-line p").textContent).toBe(workspace);
  expect(opener.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement.getAttribute("aria-label")).toBe("Close information panel");
  expect(document.body.style.overflow).toBe("hidden");
  await click(".icon-button");
  expect(container.querySelector("dialog").open).toBe(false);
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe("scroll");
  expect(opener.getAttribute("aria-expanded")).toBe("false");
});

test("next-topic cycle and selectors retain the original opener for final focus return", async () => {
  const opener = container.querySelector(".topic-trigger[data-topic='risk']");
  await click(".topic-trigger[data-topic='risk']");
  for (const expected of ["compliance", "governance", "risk"]) {
    await click(".next-topic");
    expect(container.querySelector("#governara-topic-title").textContent).toBe(GOVERNARA_TOPICS[expected].title);
    expect(container.querySelector(".topic-tab[aria-pressed='true']").dataset.topic).toBe(expected);
  }
  await click(".topic-tab[data-topic='governance']");
  await click(".icon-button"); expect(document.activeElement).toBe(opener);
  expect(container.querySelectorAll("dialog")).toHaveLength(1);
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
});

test("arrow/Home/End topic navigation and Tab boundaries keep keyboard focus in the panel", async () => {
  await click(".topic-trigger[data-topic='governance']");
  for (const [name, expected] of [["ArrowRight", "risk"], ["End", "compliance"], ["ArrowRight", "governance"], ["ArrowLeft", "compliance"], ["Home", "governance"]]) {
    await key(container.querySelector(".topic-tabs"), name);
    expect(document.activeElement.dataset.topic).toBe(expected);
    expect(document.activeElement.getAttribute("aria-pressed")).toBe("true");
  }
  const first = container.querySelector(".icon-button"), last = container.querySelector(".next-topic");
  last.focus(); const forward = await key(last, "Tab");
  expect(forward.defaultPrevented).toBe(true); expect(document.activeElement).toBe(first);
  const backward = await key(first, "Tab", true);
  expect(backward.defaultPrevented).toBe(true); expect(document.activeElement).toBe(last);
});

test("native Escape cancellation and outside-only backdrop dismissal restore focus and scroll state", async () => {
  const opener = container.querySelector(".topic-trigger[data-topic='governance']");
  await click(".topic-trigger[data-topic='governance']");
  const dialog = container.querySelector("dialog");
  dialog.getBoundingClientRect = () => ({ left: 20, right: 100, top: 20, bottom: 100 });
  await act(async () => dialog.dispatchEvent(new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true })));
  expect(dialog.open).toBe(true);
  await act(async () => dialog.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true })));
  expect(dialog.open).toBe(false); expect(document.activeElement).toBe(opener);
  await click(".topic-trigger[data-topic='governance']");
  await act(async () => dialog.dispatchEvent(new Event("cancel", { bubbles: false, cancelable: true })));
  expect(dialog.open).toBe(false); expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe("scroll");
});

test("desktop placement follows the header anchor and responds safely to a mobile resize", async () => {
  const oldWidth = window.innerWidth, oldHeight = window.innerHeight;
  const opener = container.querySelector(".topic-trigger[data-topic='risk']"), dialog = container.querySelector("dialog");
  opener.getBoundingClientRect = () => ({ left: 900, bottom: 75 });
  Object.defineProperty(dialog, "offsetWidth", { configurable: true, value: 660 });
  Object.defineProperty(dialog, "offsetHeight", { configurable: true, value: 684 });
  window.innerWidth = 1672; window.innerHeight = 941;
  try {
    await click(".topic-trigger[data-topic='risk']");
    expect(dialog.style.left).toBe("896px"); expect(dialog.style.top).toBe("93px");
    window.innerWidth = 1000; window.innerHeight = 700;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(dialog.style.left).toBe("318px"); expect(dialog.style.top).toBe("18px");
    window.innerWidth = 390;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(dialog.style.left).toBe(""); expect(dialog.style.top).toBe("");
  } finally { window.innerWidth = oldWidth; window.innerHeight = oldHeight; }
});

test("leaving an open education panel removes its listener, native modal and only its own scroll lock", async () => {
  const add = jest.spyOn(window, "addEventListener"), remove = jest.spyOn(window, "removeEventListener");
  try {
    await click(".topic-trigger[data-topic='risk']");
    const dialog = container.querySelector("dialog");
    const resize = add.mock.calls.find(([name]) => name === "resize")[1];
    await act(async () => root.render(<div>Authenticated workspace</div>));
    expect(remove).toHaveBeenCalledWith("resize", resize);
    expect(dialog.open).toBe(false); expect(document.body.style.overflow).toBe("scroll");
    expect(container.querySelector("dialog")).toBeNull();
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(container.textContent).toBe("Authenticated workspace");
  } finally { add.mockRestore(); remove.mockRestore(); }
});
