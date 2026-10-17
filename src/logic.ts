// Pure checklist logic: the "( )" item syntax, toggling, Enter continuation, converting tasks, and
// counting items overall and under each heading. No runtime imports from "obsidian".
//
//   - ( ) open item      - (x) checked item ✅ 2026-07-05      - (-) skipped item
//
// A checklist item is a list item whose text starts with "( )", "(x)", "(X)" or "(-)" followed by a
// space or the line end. Task plugins only read "[ ]", so these lines never become tasks.

/* ---------- lines ---------- */

// lead: blockquote/callout markers and indentation; bullet: "-", "*", "+" or "1." / "1)"
const ITEM_RE = /^((?:[ \t]*>)*[ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)\(([ xX-])\)(?=[ \t]|$)(.*)$/u;
const TASK_RE = /^((?:[ \t]*>)*[ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)\[(.)\](?=[ \t]|$)(.*)$/u;
const LIST_RE = /^((?:[ \t]*>)*[ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/u;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/u;
const FENCE_RE = /^\s*(?:>\s?)*\s*(`{3,}|~{3,})/u;
const DONE_DATE_RE = /[ \t]*✅️?[ \t]*(\d{4}-\d{2}-\d{2})/u;
const BLOCK_ID_RE = /[ \t]+\^[A-Za-z0-9-]+[ \t]*$/u;
const MARKER_ANYWHERE = /\([ xX-]\)/u;

export interface Item {
	lead: string; // "> " markers and indentation before the bullet
	bullet: string; // "-", "*", "+", "1." …
	gap: string; // whitespace between the bullet and "("
	status: string; // " ", "x", "X" or "-"
	body: string; // everything after ")", leading space included
}

export function parseItem(line: string): Item | null {
	const m = ITEM_RE.exec(line.replace(/\r$/, ""));
	return m ? { lead: m[1], bullet: m[2], gap: m[3], status: m[4], body: m[5] } : null;
}

/** Offsets in the line: the bullet, the "(" and just after ")". */
export function itemSpans(it: Item): { bullet: number; open: number; close: number } {
	const bullet = it.lead.length;
	const open = bullet + it.bullet.length + it.gap.length;
	return { bullet, open, close: open + 3 };
}

export type ItemState = "done" | "skip" | "open";

export function itemState(status: string): ItemState {
	if (status === "x" || status === "X") return "done";
	if (status === "-") return "skip";
	return "open";
}

/** An edit inside one line: replace [from, to) with insert. Offsets are line-relative. */
export interface LineEdit {
	from: number;
	to: number;
	insert: string;
}

/** Apply line edits (any order, non-overlapping). */
export function applyEdits(line: string, edits: LineEdit[]): string {
	return [...edits].sort((a, b) => b.from - a.from).reduce((s, e) => s.slice(0, e.from) + e.insert + s.slice(e.to), line);
}

/** Check or uncheck an item. Checking writes " ✅ <today>" at the end (before a block id) when
 *  `today` is given; unchecking removes the date. A skipped "(-)" item reopens. Null for other lines. */
export function toggleEdits(line: string, today: string | null): LineEdit[] | null {
	const clean = line.replace(/\r$/, "");
	const it = parseItem(clean);
	if (!it) return null;
	const { open } = itemSpans(it);
	const date = DONE_DATE_RE.exec(clean.slice(open + 3));
	const dateEdit = (): LineEdit[] => date ? [{ from: open + 3 + date.index, to: open + 3 + date.index + date[0].length, insert: "" }] : [];
	if (itemState(it.status) !== "open") return [{ from: open + 1, to: open + 2, insert: " " }, ...dateEdit()];
	const edits: LineEdit[] = [{ from: open + 1, to: open + 2, insert: "x" }];
	if (today && !date) {
		const block = BLOCK_ID_RE.exec(clean);
		let at = block ? block.index : clean.length;
		while (at > open + 3 && /[ \t]/.test(clean[at - 1])) at--;
		edits.push({ from: at, to: at, insert: ` ✅ ${today}` });
	}
	return edits;
}

/** What the "Toggle checklist item" hotkey does to a line: toggle an item, turn a task into an item
 *  (keeping its state and date), turn a list line or plain text into an open item. */
export function hotkeyEdits(line: string, today: string | null): LineEdit[] {
	const clean = line.replace(/\r$/, "");
	const toggle = toggleEdits(clean, today);
	if (toggle) return toggle;
	const task = TASK_RE.exec(clean);
	if (task) {
		const at = task[1].length + task[2].length + task[3].length;
		const s = task[4] === "x" || task[4] === "X" ? "x" : task[4] === "-" ? "-" : " ";
		return [{ from: at, to: at + 3, insert: `(${s})` }];
	}
	const list = LIST_RE.exec(clean);
	if (list) {
		const at = list[1].length + list[2].length + list[3].length;
		return [{ from: at, to: at, insert: "( ) " }];
	}
	const indent = /^[ \t]*/.exec(clean)![0].length;
	return [{ from: indent, to: indent, insert: "- ( ) " }];
}

/** Pressing Enter at `ch` in an item line: "split" continues the list with a new open item, "end"
 *  clears an empty item (as Obsidian does for an empty task), null leaves Enter to the editor. */
export function enterAction(line: string, ch: number): { kind: "split"; insert: string } | { kind: "end"; from: number } | null {
	const it = parseItem(line);
	if (!it) return null;
	const { bullet, close } = itemSpans(it);
	if (ch < close) return null;
	if (it.body.trim() === "") return { kind: "end", from: bullet };
	const num = /^(\d+)([.)])$/.exec(it.bullet);
	const next = num ? `${Number(num[1]) + 1}${num[2]}` : it.bullet;
	return { kind: "split", insert: `\n${it.lead}${next}${it.gap}( ) ` };
}

/** The item's text for matching rendered output against the source: no marker, no ✅ date. */
export function itemText(line: string): string {
	const it = parseItem(line);
	return it ? it.body.replace(DONE_DATE_RE, "").trim() : "";
}

/* ---------- whole notes ---------- */

/** First line after a leading frontmatter block, or 0. */
export function bodyStart(lines: string[]): number {
	if (lines[0]?.replace(/\r$/, "") !== "---") return 0;
	for (let i = 1; i < lines.length; i++) if (/^(---|\.\.\.)[ \t]*\r?$/.test(lines[i])) return i + 1;
	return 0;
}

/** Calls `fn` for every line outside frontmatter and fenced code. */
function eachTextLine(lines: string[], fn: (line: string, i: number) => void): void {
	let fence: string | null = null;
	for (let i = bodyStart(lines); i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, "");
		const f = FENCE_RE.exec(line);
		if (f) {
			if (!fence) fence = f[1];
			else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
			continue;
		}
		if (!fence) fn(line, i);
	}
}

/** Turn every task in a note ("- [ ]", "- [x] … ✅ date", "- [-]") into a checklist item. */
export function convertTasks(text: string): { text: string; count: number } {
	const lines = text.split("\n");
	let count = 0;
	eachTextLine(lines, (line, i) => {
		if (!TASK_RE.test(line)) return;
		const cr = lines[i].endsWith("\r") ? "\r" : "";
		lines[i] = applyEdits(line, hotkeyEdits(line, null)) + cr;
		count++;
	});
	return { text: lines.join("\n"), count };
}

export interface HeadingCount {
	line: number; // 0-based line of the heading in the note
	level: number; // 1–6
	text: string; // heading source text, without the #s
	key: string; // "level|text|n": stable across re-renders, n counts repeats of the same heading
	done: number; // checked items in this heading's section, subheadings included
	total: number;
}

export interface ItemLine {
	line: number;
	state: ItemState;
	heading: number; // index into headings of the nearest heading above, -1 for none
}

export interface DateSpan {
	line: number; // 0-based line of a checked item
	ch: number; // offset of "✅" in that line
	len: number; // length of "✅ 2026-07-05"
}

export interface ChecklistStats {
	done: number;
	total: number; // open + checked; skipped items are left out
	last: string | null; // newest ✅ date among checked items
	headings: HeadingCount[];
	items: ItemLine[];
	dates: DateSpan[]; // ✅ dates on checked items, for greying them out
}

const EMPTY: ChecklistStats = { done: 0, total: 0, last: null, headings: [], items: [], dates: [] };

/** Count items overall and per heading section, skipping frontmatter and fenced code. */
export function analyze(text: string): ChecklistStats {
	if (!MARKER_ANYWHERE.test(text)) return EMPTY;
	const lines = text.split("\n");
	const headings: HeadingCount[] = [];
	const items: ItemLine[] = [];
	const dates: DateSpan[] = [];
	const open: HeadingCount[] = []; // headings whose section the current line is in
	const seen = new Map<string, number>();
	let done = 0, total = 0;
	let last: string | null = null;
	eachTextLine(lines, (line, i) => {
		const h = HEADING_RE.exec(line);
		if (h) {
			const level = h[1].length;
			while (open.length && open[open.length - 1].level >= level) open.pop();
			const text = h[2].trim();
			const base = `${level}|${text}`;
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			const hc: HeadingCount = { line: i, level, text, key: `${base}|${n}`, done: 0, total: 0 };
			headings.push(hc);
			open.push(hc);
			return;
		}
		const it = parseItem(line);
		if (!it) return;
		const state = itemState(it.status);
		items.push({ line: i, state, heading: open.length ? headings.indexOf(open[open.length - 1]) : -1 });
		if (state === "skip") return;
		total++;
		for (const hc of open) hc.total++;
		if (state !== "done") return;
		done++;
		for (const hc of open) hc.done++;
		const from = itemSpans(it).close;
		const m = DONE_DATE_RE.exec(line.slice(from));
		if (!m) return;
		const ch = from + m.index + m[0].indexOf("✅");
		dates.push({ line: i, ch, len: from + m.index + m[0].length - ch });
		if (!last || m[1] > last) last = m[1];
	});
	if (!items.length) return EMPTY;
	return { done, total, last, headings, items, dates };
}

/** Whole percent, 0 for an empty list. */
/** A date as YYYY-MM-DD in local time, the format of the ✅ done date. */
export function localDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function percent(done: number, total: number): number {
	return total ? Math.round(done / total * 100) : 0;
}

/** "7/8", or "8/8 ✓" when the section is complete. */
export function countLabel(done: number, total: number): string {
	return `${done}/${total}` + (total > 0 && done === total ? " ✓" : "");
}

/* ---------- matching rendered items to source lines ---------- */

/** Letters and digits only, lower case: rendered text and source text compare on this. */
export function normalizeForMatch(s: string): string {
	return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Rendering only drops characters (link targets, markup), so the rendered letters must appear in
 *  order in the source line. */
export function textMatches(rendered: string, sourceLine: string): boolean {
	const a = normalizeForMatch(rendered.replace(DONE_DATE_RE, ""));
	const b = normalizeForMatch(itemText(sourceLine));
	if (!a) return b === "";
	let j = 0;
	for (let i = 0; i < b.length && j < a.length; i++) if (b[i] === a[j]) j++;
	return j === a.length;
}

/** The source line of a rendered item when the renderer gave no line number (embeds, hover
 *  previews, canvas): the only item with that text, or the one under the heading shown above it. */
export function findItemLine(text: string, rendered: string, headingAbove: string | null): number | null {
	const stats = analyzeCached(text);
	const lines = text.split("\n");
	const hits = stats.items.filter(it => textMatches(rendered, lines[it.line]));
	if (hits.length === 1) return hits[0].line;
	if (!hits.length || headingAbove == null) return null;
	const want = normalizeForMatch(headingAbove);
	const under = hits.filter(it => it.heading >= 0 && normalizeForMatch(stats.headings[it.heading].text) === want);
	return under.length === 1 ? under[0].line : null;
}

/* ---------- memo ---------- */

// The editor, the reading view and the status bar all ask for the same text within one change;
// keep the last few results so a long note (~1,400 items) is counted once.
const memo = new Map<string, ChecklistStats>();
const MEMO_SIZE = 4;

export function analyzeCached(text: string): ChecklistStats {
	const hit = memo.get(text);
	if (hit) return hit;
	const stats = analyze(text);
	memo.set(text, stats);
	if (memo.size > MEMO_SIZE) memo.delete(memo.keys().next().value as string);
	return stats;
}

/* ---------- ```checkboxes blocks ---------- */

export interface BlockOptions {
	heading: string | null;
	note: string | null;
}

/** The block's lines: `progress` (says what the block is; optional), `heading: …` and `note: …`. */
export function parseBlock(source: string): BlockOptions {
	const opts: BlockOptions = { heading: null, note: null };
	for (const line of source.split("\n")) {
		const m = /^\s*(heading|note)\s*:\s*(.*?)\s*$/iu.exec(line);
		if (m && m[2]) opts[m[1].toLowerCase() as keyof BlockOptions] = m[2].replace(/^\[\[|\]\]$/gu, "").replace(/^#/u, "");
	}
	return opts;
}

/** Done and total for a block: the named heading's section; else the section of the heading above the
 *  block's line (subheadings included); else the whole note. Null when a named heading is missing. */
export function blockCount(stats: ChecklistStats, heading: string | null, line: number | null = null): { done: number; total: number } | null {
	if (heading) {
		const want = normalizeForMatch(heading);
		const h = stats.headings.find(x => normalizeForMatch(x.text) === want);
		return h ? { done: h.done, total: h.total } : null;
	}
	if (line != null) {
		const above = stats.headings.filter(h => h.line < line).pop();
		if (above) return { done: above.done, total: above.total };
	}
	return { done: stats.done, total: stats.total };
}

/** The line where the section holding `line` ends: the next heading at the same or a higher level than
 *  the heading above `line`, or Infinity (the end of the note, also when no heading is above). */
export function sectionEnd(stats: ChecklistStats, line: number): number {
	const above = stats.headings.filter(h => h.line < line).pop();
	if (!above) return Infinity;
	const next = stats.headings.find(h => h.line > above.line && h.level <= above.level);
	return next ? next.line : Infinity;
}

let blocksMemo: { text: string; blocks: { line: number; opts: BlockOptions }[] } | null = null;

/** findBlocks for the last text asked about: the sticky bar asks on every scroll event. */
export function findBlocksCached(text: string): { line: number; opts: BlockOptions }[] {
	if (blocksMemo?.text !== text) blocksMemo = { text, blocks: findBlocks(text) };
	return blocksMemo.blocks;
}

/** Every ```checkboxes block in a note: the line of its opening fence and its options. */
export function findBlocks(text: string): { line: number; opts: BlockOptions }[] {
	const lines = text.split("\n"), out: { line: number; opts: BlockOptions }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = /^\s*(`{3,}|~{3,})\s*checkboxes\s*$/u.exec(lines[i]);
		if (!m) continue;
		const fence = m[1], body: string[] = [];
		let j = i + 1;
		while (j < lines.length && !lines[j].trim().startsWith(fence)) body.push(lines[j++]);
		out.push({ line: i, opts: parseBlock(body.join("\n")) });
		i = j;
	}
	return out;
}
