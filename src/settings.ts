// Settings: which parts of the checklist display are on.
import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type CheckboxesPlugin from "./main";

export interface ChecklistSettings {
	doneDates: boolean; // checking an item writes " ✅ <today>", unchecking removes it
	stickyBar: boolean; // a ```checkboxes bar stays at the top while you scroll through its section
	headingCounts: boolean; // "3/7" at the right edge of each heading with items under it
	dimChecked: boolean; // checked items in faint text with a grey ✅
	statusBar: boolean; // "14/42 checked" in the status bar for the active note
}

export const DEFAULT_SETTINGS: ChecklistSettings = {
	doneDates: true,
	headingCounts: true,
	stickyBar: true,
	dimChecked: true,
	statusBar: false,
};

export class ChecklistSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CheckboxesPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<keyof ChecklistSettings>[] {
		const toggle = (name: string, desc: string, key: keyof ChecklistSettings) =>
			({ name, desc, control: { type: "toggle", key, defaultValue: DEFAULT_SETTINGS[key] } }) as const;
		return [
			toggle("Done dates", "Write ✅ and today's date when an item is checked, and remove it when unchecked.", "doneDates"),
			toggle("Heading counts", "Show checked/total at the right edge of each heading.", "headingCounts"),
			toggle("Sticky progress bar", "Keep a progress bar at the top of the note while you scroll through its section.", "stickyBar"),
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
