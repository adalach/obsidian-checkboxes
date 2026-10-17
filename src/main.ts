// Checkboxes: wiring only. List lines starting with "( )", "(x)" or "(-)" are checklist
// items: clickable boxes that task plugins ignore. Notes with items get per-heading counts and dimmed
// checked items; a ```checkboxes block draws a progress bar.
import type { EditorView } from "@codemirror/view";
import { MarkdownView, Plugin, debounce } from "obsidian";
import { blockProcessor } from "./block";
import { registerCommands } from "./commands";
import { checklistEditor, enterKeymap, refreshEditor } from "./editor";
import { ChecklistStats, analyzeCached, localDate, percent } from "./logic";
import { readingProcessor } from "./reading";
import { ChecklistSettingTab, ChecklistSettings, DEFAULT_SETTINGS } from "./settings";
import { StickyBars } from "./sticky";
import { ChecklistViews, updateRenderedCounts } from "./views";

export default class CheckboxesPlugin extends Plugin {
	settings: ChecklistSettings = { ...DEFAULT_SETTINGS };
	views!: ChecklistViews;
	sticky!: StickyBars;
	private docs = new Set<Document>([document]); // the main window and every pop-out window
	private statusEl!: HTMLElement;
	private pending = new Set<MarkdownView>();
	private flush = debounce(() => {
		const views = [...this.pending];
		this.pending.clear();
		views.forEach(v => {
			this.views.refresh(v);
			this.sticky.update(v);
		});
		this.updateStatus();
	}, 120, false);

	/** Today's date for a newly checked item, or null when done dates are off. */
	today = (): string | null => (this.settings.doneDates ? localDate(new Date()) : null);

	async onload(): Promise<void> {
		await this.loadSettings();
		const settings = () => this.settings;
		this.views = new ChecklistViews(path => this.refreshPath(path));
		this.sticky = new StickyBars(settings, this.views);
		this.statusEl = this.addStatusBarItem();
		this.statusEl.addClass("cp-status");
		this.statusEl.hide();
		this.applyBodyClasses();

		this.registerEditorExtension([checklistEditor(settings, this.today), enterKeymap()]);
		this.registerMarkdownPostProcessor(readingProcessor(this.app, settings, this.today));
		this.registerMarkdownCodeBlockProcessor("checkboxes", blockProcessor(this.app, this.views));
		this.addSettingTab(new ChecklistSettingTab(this.app, this));
		registerCommands(this);

		const { workspace, metadataCache } = this.app;
		workspace.onLayoutReady(() => {
			workspace.iterateAllLeaves(leaf => this.docs.add(leaf.view.containerEl.ownerDocument));
			this.applyBodyClasses();
			this.refreshAll();
		});
		this.registerEvent(workspace.on("window-open", win => {
			this.docs.add(win.doc);
			this.applyBodyClasses();
		}));
		this.registerEvent(workspace.on("window-close", win => this.docs.delete(win.doc)));
		// scroll does not bubble; listen in the capture phase for the scrollers of every note
		this.registerDomEvent(document, "scroll", e => this.sticky.updateFor(e.target, this.markdownViews()), { capture: true, passive: true });
		this.registerEvent(workspace.on("window-open", win =>
			this.registerDomEvent(win.doc, "scroll", e => this.sticky.updateFor(e.target, this.markdownViews()), { capture: true, passive: true })));
		this.registerEvent(workspace.on("layout-change", () => this.refreshAll()));
		this.registerEvent(workspace.on("active-leaf-change", () => this.refreshAll()));
		this.registerEvent(workspace.on("file-open", () => this.refreshAll()));
		this.registerEvent(workspace.on("editor-change", (_editor, info) => {
			if (info instanceof MarkdownView) {
				this.pending.add(info);
				this.flush();
			}
		}));
		this.registerEvent(metadataCache.on("changed", (file, data) => {
			this.refreshPath(file.path);
			// counts of this note shown elsewhere: embeds, hover previews, other plugins' views
			const stats = analyzeCached(data);
			this.docs.forEach(doc => updateRenderedCounts(doc, file.path, stats));
		}));
		this.register(() => this.flush.cancel());
	}

	onunload(): void {
		for (const view of this.markdownViews()) {
			this.views.removeFrom(view);
			view.contentEl.querySelectorAll(".markdown-reading-view .cp-count").forEach(el => el.remove());
		}
		this.sticky.destroy();
		this.docs.forEach(doc => doc.body.removeClass("cp-dim"));
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ChecklistSettings> | null) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.applyBodyClasses();
		for (const view of this.markdownViews()) {
			(view.editor as unknown as { cm?: EditorView }).cm?.dispatch({ effects: refreshEditor.of(null) });
			if (view.getMode() === "preview") view.previewMode.rerender(true);
		}
		this.refreshAll();
	}

	private applyBodyClasses(): void {
		this.docs.forEach(doc => doc.body.toggleClass("cp-dim", this.settings.dimChecked));
	}

	private markdownViews(): MarkdownView[] {
		return this.app.workspace.getLeavesOfType("markdown")
			.map(l => l.view)
			.filter((v): v is MarkdownView => v instanceof MarkdownView);
	}

	refreshAll(): void {
		this.markdownViews().forEach(v => {
			this.views.refresh(v);
			this.sticky.update(v);
		});
		this.updateStatus();
	}

	refreshPath(path: string): void {
		this.markdownViews().filter(v => v.file?.path === path).forEach(v => {
			this.views.refresh(v);
			this.sticky.update(v);
		});
		this.updateStatus();
	}

	private updateStatus(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		let stats: ChecklistStats | null = null;
		if (view?.file && this.settings.statusBar) {
			const s = analyzeCached(view.getViewData());
			if (s.items.length) stats = s;
		}
		const el = this.statusEl;
		if (!stats) {
			el.hide();
			return;
		}
		el.empty();
		el.show();
		el.createSpan({ cls: "cp-status-track" }).createSpan({ cls: "cp-status-fill" }).style.width = `${percent(stats.done, stats.total)}%`;
		el.createSpan({ text: `${stats.done}/${stats.total} checked` });
	}
}
