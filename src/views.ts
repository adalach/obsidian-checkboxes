// Per-view state: the class that marks a note with checklist items, "Hide checked" (per note, for
// this session), and the heading counts in Reading view, embeds and hover previews.
import { MarkdownView } from "obsidian";
import { ChecklistStats, analyzeCached, countLabel } from "./logic";

const VIEW_CLASSES = ["cp-checklist", "cp-hide-checked"];

export class ChecklistViews {
	private hidden = new Set<string>(); // paths whose checked items are hidden this session
	private listeners = new Set<(path: string) => void>();

	constructor(private onToggleHidden: (path: string) => void) {}

	isHidden(path: string): boolean {
		return this.hidden.has(path);
	}

	toggleHidden(path: string): void {
		if (!this.hidden.delete(path)) this.hidden.add(path);
		this.onToggleHidden(path);
		this.listeners.forEach(fn => fn(path));
	}

	/** Called with a note's path whenever its checked items are hidden or shown; returns the unsubscribe. */
	onHiddenChange(fn: (path: string) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	/** Bring one view up to date. Returns the note's stats, or null when it has no checklist items. */
	refresh(view: MarkdownView): ChecklistStats | null {
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
		// Reading view only re-renders the sections that changed, so heading counts elsewhere would
		// go stale after a box is ticked; refresh this note's counts in place from the current text
		if (stats) updateRenderedCounts(view.containerEl.ownerDocument, file!.path, stats);
		return stats;
	}

	/** Remove the classes this plugin added to a view. */
	removeFrom(view: MarkdownView): void {
		view.containerEl.removeClasses(VIEW_CLASSES);
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
