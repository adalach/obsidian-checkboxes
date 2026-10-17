// Command palette entries.
import { Editor, EditorChange, MarkdownView, Notice } from "obsidian";
import { analyzeCached, convertTasks, hotkeyEdits } from "./logic";
import type CheckboxesPlugin from "./main";

export function registerCommands(plugin: CheckboxesPlugin): void {
	const { app } = plugin;

	plugin.addCommand({
		id: "toggle-item",
		name: "Toggle checklist item",
		editorCallback: (editor: Editor) => {
			const today = plugin.today();
			const changes: EditorChange[] = [];
			const seen = new Set<number>();
			for (const sel of editor.listSelections()) {
				const a = Math.min(sel.anchor.line, sel.head.line), b = Math.max(sel.anchor.line, sel.head.line);
				for (let line = a; line <= b; line++) {
					if (seen.has(line)) continue;
					seen.add(line);
					for (const e of hotkeyEdits(editor.getLine(line), today)) {
						changes.push({ from: { line, ch: e.from }, to: { line, ch: e.to }, text: e.insert });
					}
				}
			}
			if (changes.length) editor.transaction({ changes });
		},
	});

	plugin.addCommand({
		id: "toggle-checked",
		name: "Hide or show checked items",
		checkCallback: checking => {
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file || !analyzeCached(view.getViewData()).items.length) return false;
			if (!checking) plugin.views.toggleHidden(view.file.path);
			return true;
		},
	});

	plugin.addCommand({
		id: "convert-tasks",
		name: "Convert tasks in this note to checklist items",
		editorCallback: (editor: Editor) => {
			const before = editor.getValue();
			const { text, count } = convertTasks(before);
			if (!count) {
				new Notice("This note has no tasks to convert.");
				return;
			}
			const old = before.split("\n"), next = text.split("\n");
			const changes: EditorChange[] = [];
			next.forEach((l, line) => {
				if (l !== old[line]) changes.push({ from: { line, ch: 0 }, to: { line, ch: old[line].length }, text: l });
			});
			editor.transaction({ changes });
			new Notice(`Converted ${count} task${count === 1 ? "" : "s"} to checklist items.`);
		},
	});
}
