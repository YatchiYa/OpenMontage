import { el } from "/ui/lib.js";

// ---- theme (same pattern as the rest of Backlot) ----
const THEME_KEY = "backlot.theme";
let theme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
function applyTheme(t) {
  theme = t === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}
function themeToggle() {
  const next = theme === "light" ? "dark" : "light";
  return el("button", { class: "theme-toggle", type: "button", title: `Switch to ${next} theme`,
    onclick: () => { applyTheme(next); document.querySelector(".theme-toggle").replaceWith(themeToggle()); } },
    el("span", { class: "theme-toggle-icon", "aria-hidden": "true" }, theme === "light" ? "☾" : "☀"));
}
applyTheme(theme);
document.getElementById("liveBadge").before(themeToggle());

// ---- minimal markdown renderer (block + inline) ----
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return s;
}
function slug(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function render(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const toc = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
  while (i < lines.length) {
    let line = lines[i];

    if (/^```/.test(line)) {                       // fenced code
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {                                        // heading
      const lvl = h[1].length, txt = h[2].trim(), id = slug(txt);
      if (lvl <= 2) toc.push({ lvl, txt, id });
      out.push(`<h${lvl} id="${id}">${inline(txt)}</h${lvl}>`);
      i++; continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    if (/^\s*>/.test(line)) {                       // blockquote
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      let t = "<div class='tbl-wrap'><table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
      for (const r of rows) t += "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
      out.push(t + "</tbody></table></div>");
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {                 // unordered list
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      out.push("<ul>" + buf.map((b) => `<li>${inline(b)}</li>`).join("") + "</ul>");
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {                // ordered list
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push("<ol>" + buf.map((b) => `<li>${inline(b)}</li>`).join("") + "</ol>");
      continue;
    }
    if (line.trim() === "") { i++; continue; }      // blank

    const buf = [];                                 // paragraph
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6}\s|```|\s*>|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]) && !/^\s*(---+|\*\*\*+)\s*$/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return { html: out.join("\n"), toc };
}

async function load() {
  const doc = document.getElementById("doc");
  try {
    const res = await fetch("/api/guide");
    if (!res.ok) throw new Error(`${res.status}`);
    const md = await res.text();
    const { html, toc } = render(md);
    doc.innerHTML = html;
    const nav = document.getElementById("toc");
    nav.innerHTML = "";
    nav.append(el("div", { class: "toc-title" }, "ON THIS PAGE"));
    for (const t of toc) {
      nav.append(el("a", { href: `#${t.id}`, class: `toc-link lvl${t.lvl}` }, t.txt));
    }
  } catch (e) {
    doc.innerHTML = `<p class="loading">Could not load guide (${e.message}).</p>`;
  }
}
load();
