// Settings: which parts of the checklist display are on.
import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type CheckboxesPlugin from "./main";

export interface ChecklistSettings {
	doneDates: boolean; // checking an item writes " ✅ <today>", unchecking removes it
	headingCounts: boolean; // "3/7" at the right edge of each heading with items under it
	stickyBar: boolean; // the progress bar stays at the top while scrolling
	dimChecked: boolean; // checked items in faint text with a grey ✅
	statusBar: boolean; // "14/42 checked" in the status bar for the active note
}

export const DEFAULT_SETTINGS: ChecklistSettings = {
	doneDates: true,
	headingCounts: true,
	stickyBar: true,
	dimChecked: true,
	statusBar: true,
};

export class ChecklistSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CheckboxesPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<keyof ChecklistSettings>[] {
		const toggle = (name: string, desc: string, key: keyof ChecklistSettings) =>
			({ name, desc, control: { type: "toggle", key, defaultValue: DEFAULT_SETTINGS[key] } }) as const;
		return [
			{
				name: "Checklist items",
				desc: "List lines that start with ( ), (x) or (-) instead of [ ]. Task plugins ignore them, and every note that has them gets a progress bar.",
				searchable: false,
			},
			toggle("Done dates", "Write ✅ and today's date when an item is checked, and remove it when unchecked.", "doneDates"),
			toggle("Heading counts", "Show checked/total at the right edge of each heading.", "headingCounts"),
			toggle("Sticky progress bar", "Keep the progress bar at the top of the note while scrolling.", "stickyBar"),
			toggle("Dim checked items", "Show checked items in faint text with a grey ✅.", "dimChecked"),
			toggle("Status bar", "Show the active note's progress in the status bar.", "statusBar"),
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof ChecklistSettings];
	}

	// through saveSettings, so open notes redraw with the new option
	async setControlValue(key: string, value: unknown): Promise<void> {
		this.plugin.settings[key as keyof ChecklistSettings] = value === true;
		await this.plugin.saveSettings();
	}
}
