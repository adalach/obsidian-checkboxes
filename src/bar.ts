// The one-line progress bar above the text of a note whose properties have `checkboxes: true`, in
// Live Preview/source and in Reading view, plus the class that hides checked items, the reading-view
// heading counts, and the bars placed with a ```checkboxes block.
import { MarkdownView } from "obsidian";
import { ChecklistStats, analyzeCached, countLabel, percent } from "./logic";
import type { ChecklistSettings } from "./settings";

const BAR = "cp-bar";
const VIEW_CLASSES = ["cp-checklist", "cp-hide-checked"];

interface BarParts {
	el: HTMLElement;
	fill: HTMLElement;
	num: HTMLElement;
	last: HTMLElement;
	toggle: HTMLButtonElement;
}

interface Host {
	sizer: HTMLElement;
	place(bar: HTMLElement): void; // move the bar to its spot if it is not there; a no-op otherwise
}

export class ProgressBars {
	private hidden = new Set<string>(); // paths whose checked items are hidden this session
	private bars = new WeakMap<HTMLElement, BarParts>(); // per sizer
	private watchers = new Map<HTMLElement, MutationObserver>(); // per sizer

	constructor(
		private settings: () => ChecklistSettings,
		private onToggleHidden: (path: string) => void,
		private wantsBar: (view: MarkdownView) => boolean, // the note's properties ask for the bar
	) {}

	isHidden(path: string): boolean {
		return this.hidden.has(path);
	}

	toggleHidden(path: string): void {
		if (!this.hidden.delete(path)) this.hidden.add(path);
		this.onToggleHidden(path);
	}

	/** Bring one view up to date. Returns the note's stats, or null when it has no checklist items. */
	refresh(view: MarkdownView): ChecklistStats | null {
		const s = this.settings();
		const file = view.file;
		const all = file ? analyzeCached(view.getViewData()) : null;
		const stats = all && all.items.length ? all : null;
		const root = view.containerEl;
		root.toggleClass("cp-checklist", !!stats);
		const hide = !!stats && this.hidden.has(file!.path);
		if (hide !== root.hasClass("cp-hide-checked")) {
			root.toggleClass("cp-hide-checked", hide);
			// lines appeared or vanished behind the editor's back: let it re-measure so the line numbers follow
			(view.editor as unknown as { cm?: { requestMeasure(): void } }).cm?.requestMeasure();
		}
		this.forgetClosed();
		if (!stats) {
			this.removeFrom(view);
			return null;
		}
		if (this.wantsBar(view)) {
			for (const host of this.hosts(view)) this.render(this.ensure(host, file!.path), stats, s);
		} else this.removeBars(view);
		this.updateReadingCounts(view, stats);
		return stats;
	}

	/** Remove every bar, class and watcher this plugin added to a view. */
	removeFrom(view: MarkdownView): void {
		view.containerEl.removeClasses(VIEW_CLASSES);
		this.removeBars(view);
	}

	private removeBars(view: MarkdownView): void {
		for (const { sizer } of this.hosts(view)) {
			this.watchers.get(sizer)?.disconnect();
			this.watchers.delete(sizer);
			this.bars.get(sizer)?.el.remove();
			this.bars.delete(sizer);
		}
		view.contentEl.querySelectorAll(`.${BAR}`).forEach(el => el.remove());
	}

	/** Stop every watcher; the plugin is unloading. */
	destroy(): void {
		this.watchers.forEach(w => w.disconnect());
		this.watchers.clear();
	}

	private forgetClosed(): void {
		for (const [sizer, w] of this.watchers) {
			if (sizer.isConnected) continue;
			w.disconnect();
			this.watchers.delete(sizer);
		}
	}

	/** Where a bar goes: after Properties, before the note text, in each of the view's two modes. */
	private hosts(view: MarkdownView): Host[] {
		const out: Host[] = [];
		const cm = view.contentEl.querySelector<HTMLElement>(".markdown-source-view .cm-sizer");
		if (cm) out.push({
			sizer: cm,
			place: bar => {
				const text = cm.querySelector(":scope > .cm-contentContainer");
				if (text && bar.nextElementSibling !== text) cm.insertBefore(bar, text);
			},
		});
		const rv = view.contentEl.querySelector<HTMLElement>(".markdown-reading-view .markdown-preview-sizer");
		if (rv) out.push({
			sizer: rv,
			place: bar => {
				const header = rv.querySelector(":scope > .mod-header");
				if (header) {
					if (header.nextElementSibling !== bar) header.after(bar);
				} else if (rv.firstElementChild !== bar) rv.prepend(bar);
			},
		});
		return out;
	}

	private ensure(host: Host, path: string): BarParts {
		let parts = this.bars.get(host.sizer);
		if (!parts) {
			const el = createDiv({ cls: BAR });
			const track = el.createDiv({ cls: "cp-track" });
			parts = {
				el,
				fill: track.createDiv({ cls: "cp-fill" }),
				num: el.createSpan({ cls: "cp-num" }),
				last: el.createSpan({ cls: "cp-last" }),
				toggle: el.createEl("button", { cls: "cp-toggle", attr: { type: "button" } }),
			};
			this.bars.set(host.sizer, parts);
		}
		const el = parts.el;
		host.place(el);
		// Reading view drops nodes it does not own whenever it re-renders; put the bar back each time
		if (!this.watchers.has(host.sizer)) {
			const w = new MutationObserver(() => host.place(el));
			w.observe(host.sizer, { childList: true });
			this.watchers.set(host.sizer, w);
		}
		// stick above the scroller's top padding, or text shows through the gap over the bar
		const scroller = host.sizer.closest(".cm-scroller, .markdown-preview-view");
		if (scroller) el.style.setProperty("--cp-stick", `-${getComputedStyle(scroller).paddingTop}`);
		parts.toggle.onclick = () => this.toggleHidden(path);
		return parts;
	}

	private render(p: BarParts, stats: ChecklistStats, s: ChecklistSettings): void {
		const pct = percent(stats.done, stats.total);
		const hidden = p.el.closest(".cp-hide-checked") !== null;
		p.el.toggleClass("cp-sticky", s.stickyBar);
		p.el.toggleClass("is-complete", stats.total > 0 && stats.done === stats.total);
		p.fill.style.width = `${pct}%`;
		p.num.setText(`${stats.done}/${stats.total}`);
		p.last.setText(stats.last ? `last ✅ ${stats.last}` : "");
		p.toggle.setText(hidden ? `Show checked (${stats.done})` : "Hide checked");
	}

	/** Reading view only re-renders the sections that changed, so heading counts elsewhere would
	 *  go stale after a box is ticked; refresh this note's counts in place from the current text. */
	private updateReadingCounts(view: MarkdownView, stats: ChecklistStats): void {
		if (view.file) updateRenderedCounts(view.containerEl.ownerDocument, view.file.path, stats);
	}
}

/** The heading count element shared by the editor widget and the reading view:
 *  an outer float sized like the heading line, with the small count on its baseline. */
export function createCount(done: number, total: number): HTMLElement {
	const el = createSpan({ cls: "cp-count" });
	el.createSpan({ cls: "cp-count-text" });
	setCount(el, done, total);
	return el;
}

export function setCount(el: HTMLElement, done: number, total: number): void {
	el.toggleClass("is-complete", total > 0 && done === total);
	(el.firstElementChild as HTMLElement | null)?.setText(countLabel(done, total));
}

/** Set every rendered heading count of one note (in its own view, embeds, hover previews) from `stats`. */
export function updateRenderedCounts(doc: Document, path: string, stats: ChecklistStats): void {
	const byKey = new Map(stats.headings.map(h => [h.key, h]));
	doc.querySelectorAll<HTMLElement>(".cp-count[data-cp-key][data-cp-path]").forEach(el => {
		if (el.dataset.cpPath !== path) return;
		const h = byKey.get(el.dataset.cpKey ?? "");
		if (h) setCount(el, h.done, h.total);
	});
}
