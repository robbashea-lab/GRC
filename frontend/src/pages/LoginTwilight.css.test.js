import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import postcss from "postcss";

const sheet = postcss.parse(readFileSync(join(__dirname, "LoginTwilight.css"), "utf8"));

function declaration(container, selector, property) {
  let result;
  // Direct children keep desktop assertions separate from media overrides.
  for (const rule of container.nodes) {
    if (rule.type !== "rule" || !rule.selectors.includes(selector)) continue;
    rule.walkDecls(property, item => { result = item; });
  }
  expect(result).toBeDefined();
  return result;
}

function media(query) {
  const rule = sheet.nodes.find(node => node.type === "atrule" && node.name === "media"
    && node.params.replace(/\s/g, "") === query.replace(/\s/g, ""));
  expect(rule).toBeDefined();
  return rule;
}

test("Login styles cannot change other pages or register a shared animation name", () => {
  sheet.walkRules(rule => {
    if (rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
    for (const selector of rule.selectors) {
      // Native document scrollbars require a mounted-login ancestor gate.
      if (selector === "html:has(#login-governara)") {
        expect(rule.nodes.map(item => [item.prop, item.value])).toEqual([["color-scheme", "normal"]]);
        continue;
      }
      expect(selector).toMatch(/^#login-governara(?:\s|$)/);
      // A sibling selector after the root would escape its descendants.
      expect(selector.slice("#login-governara".length).trimStart()).not.toMatch(/^[+~]/);
    }
  });
  sheet.walkAtRules(/keyframes$/, rule => expect(rule.params).toMatch(/^login-twilight-/));
});

test("the bundled scene is the exact supplied JPEG, with no replacement artwork", () => {
  const scene = readFileSync(join(__dirname, "../assets/login-background.jpg"));
  expect(createHash("sha256").update(scene).digest("hex"))
    .toBe("a9f1ac187440dc536dab98c79c2524ed022be02bae93fa12ca38b139597cfeaf");
  const artworkUrls = [];
  sheet.walkDecls(item => {
    for (const match of item.value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) artworkUrls.push(match[1]);
  });
  expect(artworkUrls).toEqual(["../assets/login-background.jpg"]);
});

test("the scene and card move together at the supplied desktop and mobile boundaries", () => {
  const narrow = media("(max-width:1100px)");
  const mobile = media("(max-width:900px)");
  expect(declaration(sheet, "#login-governara .main", "grid-template-columns").value).toBe("minmax(0,1fr) 470px");
  expect(declaration(narrow, "#login-governara .main", "grid-template-columns").value).toBe("minmax(0,1fr) 400px");
  expect(declaration(mobile, "#login-governara .main", "grid-template-columns").value).toBe("minmax(0,1fr)");
  expect(declaration(sheet, "#login-governara .scene", "position").value).toBe("fixed");
  expect(declaration(sheet, "#login-governara .scene", "background-position").value).toBe("50% 50%");
  expect(declaration(mobile, "#login-governara .scene", "position").value).toBe("absolute");
  expect(declaration(mobile, "#login-governara .scene", "height").value).toBe("420px");
  expect(declaration(mobile, "#login-governara .scene", "background-position").value).toBe("44% 55%");
  expect(declaration(mobile, "#login-governara .main", "padding-top").value).toBe("250px");
  expect(declaration(mobile, "#login-governara .card", "backdrop-filter").value).toBe("none");
});

test("keyboard focus stays visible and reduced motion disables the login's effects", () => {
  expect(declaration(sheet, "#login-governara :focus-visible", "outline").value).toMatch(/^2px solid /);
  expect(declaration(sheet, "#login-governara .inp input:focus", "box-shadow").value).toMatch(/^0 0 0 3px /);
  const reduced = media("(prefers-reduced-motion:reduce)");
  for (const property of ["animation", "transition"]) {
    const rule = declaration(reduced, "#login-governara *", property);
    expect(rule.value).toBe("none");
    expect(rule.important).toBe(true);
  }
});
