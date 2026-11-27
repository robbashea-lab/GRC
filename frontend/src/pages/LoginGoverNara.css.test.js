import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import postcss from "postcss";

const css = readFileSync(join(__dirname, "LoginGoverNara.css"), "utf8");
const sheet = postcss.parse(css);

test("every GoverNara style and custom property stays inside the public Login root", () => {
  sheet.walkRules(rule => {
    if (rule.parent.type === "atrule" && rule.parent.name === "keyframes") return;
    for (const selector of rule.selectors) expect(selector.trim()).toMatch(/^#login-governara(?:[\s.:#]|$)/);
  });
  sheet.walkDecls(decl => { if (decl.prop.startsWith("--")) expect(decl.prop).toMatch(/^--governara-/); });
  sheet.walkAtRules("keyframes", rule => expect(rule.params).toMatch(/^governara-/));
  expect(css).not.toMatch(/https?:|data:image|:root|--portrait|utility-dialog|guide-dialog|\.check-label|\.toast/);
});

test("the exact approved WebP and its original desktop/mobile composition are retained", () => {
  const scene = readFileSync(join(__dirname, "../assets/governara-scene.webp"));
  expect(scene.length).toBe(175234);
  expect(createHash("sha256").update(scene).digest("hex")).toBe("ddbc2da4e584b5bd63e91686c6c69545bee79ee7dd14d3059cfcd5642728a330");
  expect(css).toContain("url('../assets/governara-scene.webp')");
  expect(css).toContain("grid-template-columns:minmax(0,1fr) clamp(385px,28.7vw,474px)");
  expect(css).toContain("background-position:center,45.5% 51.5%");
  expect(css).toContain("background-position:center,45.5% 52%");
  expect(css).toContain("font-family:\"Segoe UI\",Inter,Arial,sans-serif");
});

test("Login restores the mockup's inherited text defaults without altering shared body or heading styles", () => {
  const root = sheet.nodes.find(node => node.type === "rule" && node.selector === "#login-governara");
  const declarations = Object.fromEntries(root.nodes.filter(node => node.type === "decl").map(node => [node.prop, node.value]));
  expect(declarations["font-size"]).toBe("1rem");
  expect(declarations["line-height"]).toBe("normal");
  expect(declarations["font-family"]).toBe('"Segoe UI",Inter,Arial,sans-serif');
  for (const heading of ["h1", "h2", "h3"]) {
    const rule = sheet.nodes.find(node => node.type === "rule" && node.selectors.includes(`#login-governara ${heading}`));
    expect(rule.nodes.find(node => node.prop === "font-family").value).toBe("inherit");
    expect(rule.nodes.some(node => ["font-size", "font-weight", "letter-spacing"].includes(node.prop))).toBe(false);
  }
});

test("approved restrained motion, mobile dialog sizing and responsive arrangements remain scoped", () => {
  expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  const reduce = sheet.nodes.find(node => node.type === "atrule" && node.params === "(prefers-reduced-motion:reduce)");
  expect(reduce.toString()).toContain("animation:none!important");
  expect(reduce.toString()).toContain("transition:none!important");
  expect(css).toContain("@keyframes governara-border-breathe");
  expect(css).toContain("@keyframes governara-dialog-in");
  expect(css).not.toContain("scan");
  for (const query of ["(max-width:1350px)", "(max-width:1100px)", "(min-width:901px) and (max-height:850px)", "(max-width:900px)", "(max-width:450px)"]) expect(css).toContain(`@media${query}`);
  expect(css).toContain("max-height:calc(100svh - 36px)");
  expect(css).toContain("left:18px!important;top:18px!important");
});
