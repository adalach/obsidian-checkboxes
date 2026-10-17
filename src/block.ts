// A progress bar placed anywhere with a code block:
//
//   ```checkboxes
//   heading: Grocery list      (optional: the items under this heading; the whole note without it)
//   note: Padova               (optional: another note, as you would link it; this note without it)
//   ```
//
// The bar redraws when the note it counts changes.
import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from "obsidian";
import { BlockOptions, analyzeCached, blockCount, parseBlock, percent } from "./logic";

class BlockBar extends MarkdownRenderChild {
	constructor(el: HTMLElement, private app: App, private opts: BlockOptions, private sourcePath: string) {
		super(el);
	}

	private target(): TFile | null {
		if (!this.opts.note) {
			const f = this.app.vault.getAbstractFileByPath(this.sourcePath);
			return f instanceof TFile ? f : null;
		}
		return this.app.metadataCache.getFirstLinkpathDest(this.opts.note, this.sourcePath);
	}

	onload(): void {
		void this.redraw();
		this.registerEvent(this.app.metadataCache.on("changed", (file, data) => {
			if (file.path === this.target()?.path) this.draw(data);
		}));
	}

	private async redraw(): Promise<void> {
		const file = this.target();
		if (!file) return this.message(`No note "${this.opts.note ?? this.sourcePath}"`);
		this.draw(await this.app.vault.cachedRead(file));
	}

	private message(text: string): void {
		this.containerEl.empty();
		this.containerEl.createDiv({ cls: "cp-block cp-block-missing", text });
	}

	private draw(text: string): void {
		const c = blockCount(analyzeCached(text), this.opts.heading);
		if (!c) return this.message(`No heading "${this.opts.heading}"${this.opts.note ? ` in ${this.opts.note}` : ""}`);
		const el = this.containerEl;
		el.empty();
		const bar = el.createDiv({ cls: "cp-block" });
		bar.toggleClass("is-complete", c.total > 0 && c.done === c.total);
		const label = [this.opts.note, this.opts.heading].filter(Boolean).join(" › ");
		if (label) bar.createSpan({ cls: "cp-block-label", text: label });
		bar.createDiv({ cls: "cp-track" }).createDiv({ cls: "cp-fill" }).style.width = `${percent(c.done, c.total)}%`;
		bar.createSpan({ cls: "cp-num", text: `${c.done}/${c.total}` });
	}
}

export function blockProcessor(app: App) {
	return (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		ctx.addChild(new BlockBar(el, app, parseBlock(source), ctx.sourcePath));
	};
}
