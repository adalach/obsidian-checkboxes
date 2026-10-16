// The editor side: in Live Preview "- ( )" becomes a clickable box; every item line gets a class
// for dimming and hiding; checked items' ✅ dates are marked; headings get counts; Enter continues
// the list with a new "( )" item.
import { Prec, Range, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType, keymap } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { createCount } from "./bar";
import { analyzeCached, enterAction, itemSpans, itemState, parseItem, toggleEdits } from "./logic";
import type { ChecklistSettings } from "./settings";

/** Dispatched to every editor when settings change, so the decorations rebuild without an edit. */
export const refreshEditor = StateEffect.define<null>();

const dateMark = Decoration.mark({ class: "cp-done-date" });

/** Toggle the item on the line at `pos`, as one undoable change. */
export function toggleItemAt(view: EditorView, pos: number, today: string | null): boolean {
	const line = view.state.doc.lineAt(pos);
	const edits = toggleEdits(line.text, today);
	if (!edits) return false;
	view.dispatch({
		changes: edits.map(e => ({ from: line.from + e.from, to: line.from + e.to, insert: e.insert })),
		userEvent: "input.toggle",
	});
	return true;
}

class BoxWidget extends WidgetType {
	constructor(readonly status: string, readonly bullet: string | null, readonly today: () => string | null) {
		super();
	}
	eq(other: BoxWidget): boolean {
		return other.status === this.status && other.bullet === this.bullet;
	}
	toDOM(view: EditorView): HTMLElement {
		const wrap = createSpan({ cls: "cp-box-wrap" });
		if (this.bullet != null) {
			// an invisible copy of Obsidian's bullet gives the box the bullet's exact width, so the
			// text starts where Obsidian indents the item's wrapped lines
			wrap.addClass("is-bullet");
			wrap.createSpan({ cls: "cp-bullet-ghost cm-formatting cm-formatting-list cm-formatting-list-ul" })
				.append(createSpan({ cls: "list-bullet", text: this.bullet }), " ");
		}
		const box = wrap.createEl("input", { cls: "cp-box", type: "checkbox" });
		const state = itemState(this.status);
		box.checked = state === "done";
		box.indeterminate = state === "skip";
		box.setAttr("aria-label", state === "done" ? "Uncheck item" : "Check item");
		// keep the cursor where it is: the click only edits the marker
		box.addEventListener("mousedown", e => e.preventDefault());
		box.addEventListener("click", e => {
			e.preventDefault();
			toggleItemAt(view, view.posAtDOM(wrap), this.today());
		});
		return wrap;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

class CountWidget extends WidgetType {
	constructor(readonly done: number, readonly total: number) {
		super();
	}
	eq(other: CountWidget): boolean {
		return other.done === this.done && other.total === this.total;
	}
	toDOM(): HTMLElement {
		return createCount(this.done, this.total);
	}
}

export function checklistEditor(settings: () => ChecklistSettings, today: () => string | null) {
	return ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = this.build(view);
		}
		update(u: ViewUpdate): void {
			const modeChanged = u.startState.field(editorLivePreviewField, false) !== u.state.field(editorLivePreviewField, false);
			if (u.docChanged || u.viewportChanged || u.selectionSet || modeChanged
				|| u.transactions.some(t => t.effects.some(e => e.is(refreshEditor)))) this.decorations = this.build(u.view);
		}
		build(view: EditorView): DecorationSet {
			const s = settings();
			const doc = view.state.doc;
			const stats = analyzeCached(doc.toString());
			if (!stats.items.length) return Decoration.none;
			const live = view.state.field(editorLivePreviewField, false) ?? false;
			const sel = view.state.selection.ranges;
			const ranges: Range<Decoration>[] = [];

			// item lines in view: a class for dimming/hiding, and in Live Preview the box itself
			for (const { from, to } of view.visibleRanges) {
				for (let pos = from; pos <= to;) {
					const line = doc.lineAt(pos);
					pos = line.to + 1;
					const it = parseItem(line.text);
					if (!it) continue;
					ranges.push(Decoration.line({ class: "cp-item-line", attributes: { "data-cp-item": it.status } }).range(line.from));
					if (!live) continue;
					const sp = itemSpans(it);
					// the box replaces the bullet and "( ) "; list numbers stay
					const ordered = /^\d/.test(it.bullet);
					const start = line.from + (ordered ? sp.open : sp.bullet);
					const end = line.from + sp.close + (/^[ \t]/.test(it.body) ? 1 : 0);
					// a cursor inside the marker, or a selection across it, shows the source for editing
					if (sel.some(r => r.empty ? r.head > start && r.head < end : r.from < end && r.to > start)) continue;
					ranges.push(Decoration.replace({ widget: new BoxWidget(it.status, ordered ? null : it.bullet, today) }).range(start, end));
				}
			}
			for (const d of stats.dates) {
				if (d.line >= doc.lines) continue;
				const from = doc.line(d.line + 1).from + d.ch;
				ranges.push(dateMark.range(from, from + d.len));
			}
			if (s.headingCounts) {
				for (const h of stats.headings) {
					if (!h.total || h.line >= doc.lines) continue;
					const end = doc.line(h.line + 1).to;
					ranges.push(Decoration.widget({ widget: new CountWidget(h.done, h.total), side: 1 }).range(end));
				}
			}
			return Decoration.set(ranges, true);
		}
	}, { decorations: v => v.decorations });
}

/** Enter in an item continues the list with "( )"; Enter on an empty item ends the list; Backspace
 *  at the start of an item's text removes the box and leaves a plain list item. */
export function enterKeymap() {
	return Prec.highest(keymap.of([{
		key: "Backspace",
		run: view => {
			const sel = view.state.selection;
			if (sel.ranges.length !== 1 || !sel.main.empty) return false;
			const pos = sel.main.head;
			const line = view.state.doc.lineAt(pos);
			const it = parseItem(line.text);
			if (!it) return false;
			const { close } = itemSpans(it);
			const textStart = close + (/^[ \t]/.test(it.body) ? 1 : 0);
			if (pos - line.from !== textStart) return false;
			view.dispatch({ changes: { from: line.from + itemSpans(it).open, to: line.from + textStart }, userEvent: "delete" });
			return true;
		},
	}, {
		key: "Enter",
		run: view => {
			// an open link or tag suggestion takes Enter for itself
			if (document.querySelector(".suggestion-container")) return false;
			const sel = view.state.selection;
			if (sel.ranges.length !== 1 || !sel.main.empty) return false;
			const pos = sel.main.head;
			const line = view.state.doc.lineAt(pos);
			const act = enterAction(line.text, pos - line.from);
			if (!act) return false;
			if (act.kind === "end") {
				view.dispatch({ changes: { from: line.from + act.from, to: line.to, insert: "" }, selection: { anchor: line.from + act.from }, userEvent: "input" });
			} else {
				view.dispatch({ changes: { from: pos, insert: act.insert }, selection: { anchor: pos + act.insert.length }, scrollIntoView: true, userEvent: "input" });
			}
			return true;
		},
	}]));
}
