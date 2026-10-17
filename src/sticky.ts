// "Sticky progress bar": while you scroll through the section a ```checkboxes bar counts, a copy of the
// bar stays at the top of the note. Live Preview and Reading view render lazily and drop blocks far out
// of view, so this works from the note's text: the view's top line against each block's line range.
import { MarkdownView } from "obsidian";
import { buildBar } from "./block";
import { analyzeCached, blockCount, findBlocks, sectionEnd } from "./logic";
import type { ChecklistSettings } from "./settings";
import type { ChecklistViews } from "./views";

export class StickyBars {
	private shown = new Map<MarkdownView, { el: HTMLElement; key: string }>();

	constructor(private settings: () => ChecklistSettings, private views: ChecklistViews) {}

	/** Show, update or hide the pinned copy in one view; call after scrolling and edits. */
	update(view: MarkdownView): void {
		const file = view.file;
		if (!file || !this.settings().stickyBar) return this.hide(view);
		const text = view.getViewData();
		const top = view.currentMode.getScroll();
		const stats = analyzeCached(text);
		// the innermost section with a bar that counts its own section
		let start = -1;
		for (const b of findBlocks(text)) {
			if (b.opts.note || b.opts.heading || b.line >= top || b.line <= start) continue;
			if (top < sectionEnd(stats, b.line)) start = b.line;
		}
		if (start < 0) return this.hide(view);
		const c = blockCount(stats, null, start)!;
		const hidden = this.views.isHidden(file.path);
		const key = `${start}|${c.done}/${c.total}|${hidden}`;
		const cur = this.shown.get(view);
		if (cur?.key === key) return;
		cur?.el.remove();
		const host = view.contentEl;
		host.addClass("cp-sticky-host");
		const el = host.createDiv({ cls: "cp-sticky" });
		el.appendChild(buildBar(c, "", { hidden, toggle: () => this.views.toggleHidden(file.path) }));
		this.shown.set(view, { el, key });
	}

	updateFor(target: EventTarget | null, views: MarkdownView[]): void {
		if (!(target instanceof Node)) return;
		for (const v of views) if (v.containerEl.contains(target)) this.update(v);
	}

	hide(view: MarkdownView): void {
		this.shown.get(view)?.el.remove();
		this.shown.delete(view);
		view.contentEl.removeClass("cp-sticky-host");
	}

	destroy(): void {
		for (const view of [...this.shown.keys()]) this.hide(view);
	}
}
