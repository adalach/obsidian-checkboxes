import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	analyze, analyzeCached, applyEdits, localDate, blockCount, findBlocks, sectionEnd, convertTasks, countLabel, enterAction, findItemLine, hotkeyEdits, itemText,
	parseBlock, parseItem, percent, textMatches, toggleEdits,
} from "../src/logic";

// A trip note written with Tasks checkboxes, before converting
const padovaTasks = readFileSync(new URL("./fixtures/padova-tasks.md", import.meta.url), "utf8");
const padova = convertTasks(padovaTasks).text;
const toggle = (line: string, today: string | null = "2026-10-15") => applyEdits(line, toggleEdits(line, today) ?? []);
const hotkey = (line: string) => applyEdits(line, hotkeyEdits(line, "2026-10-15"));

describe("parseItem", () => {
	it("reads bullets, numbers, indentation and quotes", () => {
		expect(parseItem("- ( ) a")).toMatchObject({ lead: "", bullet: "-", status: " ", body: " a" });
		expect(parseItem("\t* (x) b ✅ 2026-01-01")).toMatchObject({ lead: "\t", bullet: "*", status: "x" });
		expect(parseItem("> 12. (-) c")).toMatchObject({ lead: "> ", bullet: "12.", status: "-" });
		expect(parseItem("- ( )")).toMatchObject({ body: "" });
	});
	it("leaves tasks, enumerations and text alone", () => {
		for (const l of ["- [ ] task", "- (a) option", "- (1) first", "- (x)y", "( ) not a list", "- text (x) later"]) expect(parseItem(l)).toBeNull();
	});
});

describe("toggle", () => {
	it("checks with a done date and unchecks without it", () => {
		expect(toggle("- ( ) Prato della Valle")).toBe("- (x) Prato della Valle ✅ 2026-10-15");
		expect(toggle("- (x) Prato della Valle ✅ 2026-07-05")).toBe("- ( ) Prato della Valle");
		expect(toggle("- ( ) a", null)).toBe("- (x) a");
	});
	it("keeps block ids last, trims trailing space, reopens skipped items", () => {
		expect(toggle("- ( ) a ^abc")).toBe("- (x) a ✅ 2026-10-15 ^abc");
		expect(toggle("- (x) a ✅ 2026-10-15 ^abc")).toBe("- ( ) a ^abc");
		expect(toggle("- ( ) a   ")).toBe("- (x) a ✅ 2026-10-15   ");
		expect(toggle("- (-) a")).toBe("- ( ) a");
		expect(toggle("- ( )")).toBe("- (x) ✅ 2026-10-15");
	});
	it("returns null for other lines", () => {
		expect(toggleEdits("- [ ] task", "2026-10-15")).toBeNull();
	});
});

describe("hotkey", () => {
	it("toggles items and turns tasks, list lines and text into items", () => {
		expect(hotkey("- (x) a ✅ 2026-01-01")).toBe("- ( ) a");
		expect(hotkey("- [x] a ✅ 2026-01-01")).toBe("- (x) a ✅ 2026-01-01");
		expect(hotkey("  - [ ] a")).toBe("  - ( ) a");
		expect(hotkey("1. a")).toBe("1. ( ) a");
		expect(hotkey("\tplain")).toBe("\t- ( ) plain");
		expect(hotkey("")).toBe("- ( ) ");
	});
});

describe("enterAction", () => {
	it("continues the list with an open item", () => {
		expect(enterAction("- (x) a ✅ 2026-01-01", 22)).toEqual({ kind: "split", insert: "\n- ( ) " });
		expect(enterAction("\t* ( ) a", 8)).toEqual({ kind: "split", insert: "\n\t* ( ) " });
		expect(enterAction("> 9. ( ) a", 10)).toEqual({ kind: "split", insert: "\n> 10. ( ) " });
	});
	it("ends the list on an empty item and ignores the cursor inside the marker", () => {
		expect(enterAction("  - ( ) ", 8)).toEqual({ kind: "end", from: 2 });
		expect(enterAction("- ( ) a", 2)).toBeNull();
		expect(enterAction("- [ ] a", 7)).toBeNull();
	});
});

describe("convertTasks on a trip note", () => {
	it("converts every box and nothing else", () => {
		const r = convertTasks(padovaTasks);
		expect(r.count).toBe(42);
		expect(r.text).not.toMatch(/\[[ xX]\]/);
		expect(r.text).toContain("- (x) Cappella degli Scrovegni ✅ 2026-05-06");
		expect(r.text).toContain("- ( ) Oratorio di San Michele");
		expect(r.text.split("\n").length).toBe(padovaTasks.split("\n").length);
	});
	it("skips code and frontmatter", () => {
		const r = convertTasks("---\nx: \"- [ ] no\"\n---\n```\n- [ ] code\n```\n- [ ] yes\n");
		expect(r.count).toBe(1);
		expect(r.text).toContain("- [ ] code");
	});
});

describe("analyze", () => {
	const s = analyze(padova);
	it("counts items and the newest done date", () => {
		expect([s.done, s.total, s.last]).toEqual([14, 42, "2026-05-06"]);
		expect(percent(s.done, s.total)).toBe(33);
	});
	it("counts each heading's section, subheadings included", () => {
		const byText = Object.fromEntries(s.headings.map(h => [h.text, [h.done, h.total]]));
		expect(byText["Padova Urbs Picta / Fresco Card Sites"]).toEqual([7, 8]);
		expect(byText["Padova — Other Places to See Not Covered by the Fresco Card"]).toEqual([5, 20]);
		expect(byText["Main paid / ticketed places"]).toEqual([3, 6]);
		expect(byText["Free churches and religious sites"]).toEqual([1, 7]);
		expect(byText["Squares, streets, and atmosphere"]).toEqual([1, 7]);
		expect(byText["Vicenza — Places to See"]).toEqual([2, 14]);
	});
	it("locates the ✅ date of every checked item", () => {
		expect(s.dates).toHaveLength(14);
		const lines = padova.split("\n");
		for (const d of s.dates) expect(lines[d.line].slice(d.ch, d.ch + d.len)).toMatch(/^✅ \d{4}-\d{2}-\d{2}$/u);
	});
	it("ignores tasks, so a task in a checklist note stays a task", () => {
		const t = analyze("# Trip\n- [ ] book tickets 📅 2026-07-01\n- ( ) museum\n- (x) cafe\n- (-) tower\n");
		expect([t.done, t.total, t.items.length]).toEqual([1, 2, 3]);
	});
	it("is empty for notes without items", () => {
		expect(analyze("# Note\n- [ ] task\n- (a) option\n").items).toHaveLength(0);
		expect(analyzeCached(padova)).toBe(analyzeCached(padova));
	});
	it("gives repeated headings distinct keys", () => {
		const t = analyze("# A\n## Day\n- (x) 1\n## Day\n- ( ) 2\n");
		expect(t.headings.map(h => [h.key, h.done, h.total])).toEqual([["1|A|0", 1, 2], ["2|Day|0", 1, 1], ["2|Day|1", 0, 1]]);
	});
});

describe("matching rendered items", () => {
	it("compares letters in order, ignoring markup and dates", () => {
		expect(textMatches("Palazzo Bo / University", "- ( ) [[Palazzo Bo]] / **University**")).toBe(true);
		expect(textMatches("Teatro Olimpico ✅ 2026-05-05", "- (x) Teatro Olimpico ✅ 2026-05-05")).toBe(true);
		expect(textMatches("Torre", "- ( ) Basilica")).toBe(false);
		expect(itemText("- (x) a ✅ 2026-01-01")).toBe("a");
	});
	it("finds a unique item, and tells repeated items apart by the heading above", () => {
		const lines = padova.split("\n");
		const teatro = findItemLine(padova, "Teatro Olimpico", null)!;
		expect(lines[teatro]).toContain("Teatro Olimpico");
		expect(findItemLine(padova, "Piazza dei Signori", null)).toBeNull();
		const vicenza = findItemLine(padova, "Piazza dei Signori", "Vicenza — Places to See")!;
		const padua = findItemLine(padova, "Piazza dei Signori", "Squares, streets, and atmosphere")!;
		expect(vicenza).toBeGreaterThan(padua);
		expect(findItemLine(padova, "Piazza dei Signori", "Nowhere")).toBeNull();
	});
	it("labels counts", () => {
		expect(countLabel(7, 8)).toBe("7/8");
		expect(countLabel(8, 8)).toBe("8/8 ✓");
		expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
	});
});

describe("checkboxes blocks", () => {
	it("reads heading and note, with or without link brackets", () => {
		expect(parseBlock("heading: Grocery list\nnote: [[Padova]]\n")).toEqual({ heading: "Grocery list", note: "Padova" });
		expect(parseBlock("Heading:  #Sights ")).toEqual({ heading: "Sights", note: null });
		expect(parseBlock("")).toEqual({ heading: null, note: null });
		expect(parseBlock("progress\nheading: Sights")).toEqual({ heading: "Sights", note: null });
	});
	it("counts one heading's section, the whole note, or nothing for a missing heading", () => {
		const s = analyze(padova);
		expect(blockCount(s, "Vicenza — Places to See")).toEqual({ done: 2, total: 14 });
		expect(blockCount(s, "vicenza places to see")).toEqual({ done: 2, total: 14 });
		expect(blockCount(s, null)).toEqual({ done: 14, total: 42 });
		expect(blockCount(s, "Nowhere")).toBeNull();
	});
	it("defaults to the section the block sits in, subheadings included, or the whole note above the first heading", () => {
		const s = analyze(padova);
		const line = (text: string) => padova.split("\n").findIndex(l => l.includes(text));
		expect(blockCount(s, null, line("Teatro Olimpico"))).toEqual({ done: 2, total: 14 });
		expect(blockCount(s, null, line("Main paid / ticketed places") + 1)).toEqual({ done: 3, total: 6 });
		expect(blockCount(s, null, 0)).toEqual({ done: 14, total: 42 });
		expect(blockCount(analyze("intro\n# A\n- (x) 1\n## B\n- ( ) 2\n"), null, 2)).toEqual({ done: 1, total: 2 });
	});
	it("finds where a block's section ends", () => {
		const t = analyze("intro\n# A\n- (x) 1\n## B\n- ( ) 2\n## C\n# D\n");
		expect(sectionEnd(t, 2)).toBe(6); // under A: until D
		expect(sectionEnd(t, 4)).toBe(5); // under B: until C
		expect(sectionEnd(t, 0)).toBe(Infinity); // above the first heading: the whole note
	});
	it("finds the blocks in a note", () => {
		const text = "```checkboxes\nprogress\n```\n# A\n~~~checkboxes\nheading: B\n~~~\n```js\nx\n```\n";
		expect(findBlocks(text)).toEqual([{ line: 0, opts: { heading: null, note: null } }, { line: 4, opts: { heading: "B", note: null } }]);
	});
});
