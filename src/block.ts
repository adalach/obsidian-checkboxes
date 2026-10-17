// A progress bar placed with a code block:
//
//   ```checkboxes
//   progress
//   heading: Grocery list      (optional: the items under this heading)
//   note: Padova               (optional: another note, as you would link it)
//   ```
//
// Without `heading:` it counts the section the block sits in, subheadings included, or the whole note
// above the first heading. A bar counting its own note has the "Hide checked" switch. It redraws when
// the counted note changes. With "Sticky progress bar" on, a copy stays at the top of the note while
// you scroll through the block's section.
import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from "obsidian";
import { BlockOptions, analyzeCached, blockCount, parseBlock, percent } from "./logic";
import type { ChecklistViews } from "./views";

class BlockBar extends MarkdownRenderChild {
	private text: string | null = null;

	constructor(el: HTMLElement, private app: App, private views: ChecklistViews, private opts: BlockOptions,
		private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	private target(): TFile | null {
		if (!this.opts.note) {
			const f = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
			return f instanceof TFile ? f : null;
		}
		return this.app.metadataCache.getFirstLinkpathDest(this.opts.note, this.ctx.sourcePath);
	}

	onload(): void {
		void this.load_();
		this.registerEvent(this.app.metadataCache.on("changed", (file, data) => {
			if (file.path === this.target()?.path) this.draw(data);
		}));
		this.register(this.views.onHiddenChange(path => {
			if (!this.opts.note && path === this.ctx.sourcePath && this.text != null) this.draw(this.text);
		}));
	}

	private async load_(): Promise<void> {
		const file = this.target();
		if (!file) return this.message(`No note "${this.opts.note ?? this.ctx.sourcePath}"`);
		this.draw(await this.app.vault.cachedRead(file));
	}

	private message(text: string): void {
		this.containerEl.empty();
		this.containerEl.createDiv({ cls: "cp-block cp-block-missing", text });
	}

	private draw(text: string): void {
		this.text = text;
		// the block's own line decides its section; the renderer knows it only for a block in this note
		const line = !this.opts.note && !this.opts.heading ? this.ctx.getSectionInfo(this.containerEl)?.lineStart ?? null : null;
		const c = blockCount(analyzeCached(text), this.opts.heading, line);
		if (!c) return this.message(`No heading "${this.opts.heading}"${this.opts.note ? ` in ${this.opts.note}` : ""}`);
		const path = this.ctx.sourcePath;
		const label = [this.opts.note, this.opts.heading].filter(Boolean).join(" › ");
		this.containerEl.empty();
		this.containerEl.appendChild(buildBar(c, label, this.opts.note ? null
			: { hidden: this.views.isHidden(path), toggle: () => this.views.toggleHidden(path) }));
	}
}

/** The bar itself: optional label, the filling line, "done/total", and for a bar counting its own note
 *  the "Hide checked" switch. Shared by blocks and the sticky copy. */
export function buildBar(c: { done: number; total: number }, label: string,
	hide: { hidden: boolean; toggle: () => void } | null): HTMLElement {
	const bar = createDiv({ cls: "cp-block" });
	bar.toggleClass("is-complete", c.total > 0 && c.done === c.total);
	if (label) bar.createSpan({ cls: "cp-block-label", text: label });
	bar.createDiv({ cls: "cp-track" }).createDiv({ cls: "cp-fill" }).style.width = `${percent(c.done, c.total)}%`;
	bar.createSpan({ cls: "cp-num", text: `${c.done}/${c.total}` });
	if (hide) {
		const button = bar.createEl("button", { cls: "cp-toggle", attr: { type: "button" }, text: hide.hidden ? "Show checked" : "Hide checked" });
		// keep Live Preview from opening the block for editing
		button.addEventListener("mousedown", e => {
			e.preventDefault();
			e.stopPropagation();
		});
		button.addEventListener("click", e => {
			e.preventDefault();
			e.stopPropagation();
			hide.toggle();
		});
	}
	return bar;
}

export function blockProcessor(app: App, views: ChecklistViews) {
	return (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		ctx.addChild(new BlockBar(el, app, views, parseBlock(source), ctx));
	};
}
