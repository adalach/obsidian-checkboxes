// Reading view, embeds, hover previews and canvas: "( )" list items become clickable boxes and
// headings get counts. A click is written to the item's source line: the renderer's line number
// when it gives one, otherwise the only item with that text, or the one under the heading above it.
import { App, MarkdownPostProcessor, MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import { createCount } from "./bar";
import { analyzeCached, applyEdits, findItemLine, itemState, parseItem, textMatches, toggleEdits } from "./logic";
import type { ChecklistSettings } from "./settings";

const MARKER_RE = /^(\s*)\(([ xX-])\)(?=\s|$)[ \t]?/u;
const DATE_RE = /✅️?\s*\d{4}-\d{2}-\d{2}/u;
const SKIP = new Set(["list-bullet", "list-collapse-indicator", "collapse-indicator"]);

/** The text node that opens a list item's own content (inside a <p> for loose lists), or null
 *  when the item starts with something else (a link, bold text, a nested list). */
function leadingText(el: Element): Text | null {
	for (const node of Array.from(el.childNodes)) {
		if (node.nodeType === Node.TEXT_NODE) {
			if ((node.textContent ?? "").trim()) return node as Text;
			continue;
		}
		if (!node.instanceOf(HTMLElement)) continue;
		if ([...node.classList].some(c => SKIP.has(c))) continue;
		return node.tagName === "P" ? leadingText(node) : null;
	}
	return null;
}

/** A list item's own text: without nested lists, the box and the heading count. */
function ownText(li: HTMLElement): string {
	const c = li.cloneNode(true) as HTMLElement;
	c.querySelectorAll("ul, ol, input, .cp-count").forEach(e => e.remove());
	return c.textContent ?? "";
}

/** The text of the last heading before `el` in the same rendered note, or null. */
function headingAbove(el: HTMLElement): string | null {
	const root = el.closest(".markdown-preview-sizer, .markdown-embed-content, .markdown-rendered, .popover, .canvas-node-content") ?? el.ownerDocument.body;
	let best: Element | null = null;
	root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(h => {
		if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
	});
	if (!best) return null;
	const c = (best as Element).cloneNode(true) as HTMLElement;
	c.querySelectorAll(".cp-count, .heading-collapse-indicator").forEach(e => e.remove());
	return c.textContent?.trim() ?? null;
}

/** Grey out a "✅ date" inside the item's own text. */
function markDate(li: HTMLElement): void {
	const walker = li.ownerDocument.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
		acceptNode: n => n.parentElement?.closest("ul, ol") !== li.closest("ul, ol") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
	});
	for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
		const m = DATE_RE.exec(n.data);
		if (!m) continue;
		const date = n.splitText(m.index);
		date.splitText(m[0].length);
		const span = createSpan({ cls: "cp-done-date" });
		date.replaceWith(span);
		span.append(date);
		return;
	}
}

export function readingProcessor(app: App, settings: () => ChecklistSettings, today: () => string | null): MarkdownPostProcessor {
	const toggle = async (li: HTMLElement, section: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> => {
		const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;
		const text = await app.vault.read(file);
		const lines = text.split("\n");
		const rendered = ownText(li);
		let target: number | null = null;
		const info = ctx.getSectionInfo(section);
		const rel = li.getAttribute("data-line");
		if (info && rel != null && /^\d+$/.test(rel)) {
			const n = info.lineStart + Number(rel);
			if (parseItem(lines[n] ?? "") && textMatches(rendered, lines[n])) target = n;
		}
		if (target == null) target = findItemLine(text, rendered, headingAbove(li));
		if (target == null) {
			new Notice(`Could not tell which line of ${file.basename} this item is; open the note to tick it.`);
			return;
		}
		const line = target;
		await app.vault.process(file, data => {
			const ls = data.split("\n");
			const cur = ls[line];
			if (cur == null) return data;
			const clean = cur.replace(/\r$/, "");
			const edits = toggleEdits(clean, today());
			if (!edits) return data;
			ls[line] = applyEdits(clean, edits) + (cur.endsWith("\r") ? "\r" : "");
			return ls.join("\n");
		});
	};

	return (el, ctx) => {
		// checklist items
		el.querySelectorAll<HTMLElement>("li").forEach(li => {
			if (li.hasClass("cp-item") || li.hasClass("task-list-item")) return;
			const lead = leadingText(li);
			const m = lead ? MARKER_RE.exec(lead.data) : null;
			if (!lead || !m) return;
			lead.data = lead.data.slice(m[0].length);
			const state = itemState(m[2]);
			const box = createEl("input", { cls: "cp-box", type: "checkbox" });
			box.checked = state === "done";
			box.indeterminate = state === "skip";
			lead.before(box);
			li.addClass("cp-item");
			li.toggleClass("is-checked", state === "done");
			li.dataset.cpItem = m[2];
			if (state === "done") markDate(li);
			box.addEventListener("click", e => {
				e.preventDefault();
				void toggle(li, el, ctx);
			});
		});

		// heading counts
		if (!settings().headingCounts) return;
		const heading = el.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
		if (!heading || heading.querySelector(".cp-count")) return;
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const h = analyzeCached(info.text).headings.find(x => x.line === info.lineStart);
		if (!h || !h.total) return;
		const count = createCount(h.done, h.total);
		count.dataset.cpKey = h.key;
		count.dataset.cpPath = ctx.sourcePath;
		heading.append(count);
	};
}
