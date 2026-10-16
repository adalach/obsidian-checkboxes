# Checkboxes

**Checklists that aren't tasks.**

In Obsidian, every `- [ ]` is a task. Your grocery list, your packing list and the forty sights you want to see in Padova all land in the Tasks plugin's queries, in Dataview task lists, in `task:` searches and in every dashboard built on them. Checkboxes adds a second kind of box, `- ( )`, that you can tick just the same but that no task tool ever picks up.

<!-- TODO: GIF: ticking items in a packing list, the progress bar filling, Hide checked -->

> [!important] Not a replacement for Tasks
> Checkboxes does not manage tasks: no due dates, priorities, recurrence or queries. Keep using the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin, Dataview or plain checkboxes for your to-dos. Checkboxes takes care of everything else, so your task views show only real tasks.

## Two kinds of boxes

```markdown
## This week
- [ ] Send the reviewer response 📅 2026-10-20    ← a task: Tasks, Dataview and your dashboard see it

## Groceries
- ( ) Oat milk                                   ← a checklist item: nothing but this note sees it
- (x) Coffee ✅ 2026-10-16                         ← checked, with the day you checked it
- (-) Avocados                                    ← skipped: struck through, not counted
```

Both kinds can live in the same note. A trip note can hold "Book the museum tickets 📅" as a task and the sights as checklist items.

## Features

- **Clickable boxes everywhere you read a note:** Live Preview, Reading view, embeds and hover previews. They use your theme's own checkbox, so they look like the boxes you already have.
- **Done dates:** checking writes `✅ 2026-10-16`, unchecking removes it.
- **A progress bar** under the properties of every note with checklist items, such as `14/42 · 33% · last ✅ 2026-07-05`. It stays at the top while you scroll a long list.
- **Counts on headings,** such as `3/6`, so a packing list shows at a glance which bag is done. A heading counts its subheadings too.
- **Hide checked** on the bar shows only what is left.
- **Faint checked items** with a grey ✅, so the open ones stand out.
- **A count in the status bar** for the note you are in.
- **Typing that feels native:** Enter starts the next `( )` item, Enter on an empty item ends the list, and Backspace at the start of an item turns it back into a plain bullet.
- **Nothing to configure:** any note with `( )` items gets the progress display. There are no properties, folders, tags or query filters to keep up to date.

## Usage

| Do this | How |
|---|---|
| Start a checklist item | Type `- ( ) `, or run **Toggle checklist item** on a line |
| Check or uncheck | Click the box, or run **Toggle checklist item** |
| Skip an item | Write `(-)` instead of `( )` |
| Turn a task into a checklist item | Run **Toggle checklist item** on the task (a checked task stays checked) |
| Convert a whole note | Command **Convert tasks in this note to checklist items** (one undoable step) |
| Show only open items | **Hide checked** on the progress bar, or the command **Hide or show checked items** |

**Toggle checklist item** works on the cursor line or on every selected line. It has no hotkey out of the box, so it cannot clash with yours; **Cmd/Ctrl+Shift+L** is a good choice under **Settings → Hotkeys**. Obsidian's own **Cmd/Ctrl+L** keeps toggling tasks, so both kinds are then one shortcut away.

## Why not…

**…plain checkboxes, excluded from queries?** That works until it doesn't. Every Tasks query, every Dataview query and every dashboard needs its own exclusion, the paths break when you rename a note, and Obsidian's `task:` search ignores all of them.

**…a Tasks custom status like `[P]` set to `NON_TASK`?** Tasks has [custom statuses](https://publish.obsidian.md/tasks/Getting+Started/Statuses/Custom+Statuses), and the `NON_TASK` type is meant for checkbox-like lines that aren't actionable. It is the closest thing to this plugin, but it solves a different problem:

- Tasks still indexes these lines. They stay out of `not done` queries, but Tasks counts `NON_TASK` as done, so they show up in `done` queries such as "recently completed" unless every such query adds `status.type is not NON_TASK`.
- Only Tasks knows about the status. Dataview, Obsidian's `task:` search and other task plugins still see a task.
- You configure the status yourself, and Obsidian draws `[P]` as a checked box unless your theme styles it.

**…the Tasks global filter?** Tasks can treat only lines with a tag such as `#task` as tasks. Then every real task needs that tag, and Dataview and Obsidian itself still see every checkbox.

| | Plain `- [ ]` | Tasks `NON_TASK` status | Tasks global filter | Checkboxes `- ( )` |
|---|---|---|---|---|
| In Tasks queries | Yes | Yes, except `not done` queries | No | No |
| In Dataview task queries | Yes | Yes | Yes | No |
| In `task:` search and other plugins | Yes | Yes | Yes | No |
| Setup | An exclusion in every query | Define a status | Tag every real task | None |
| Clickable without extra plugins | Yes | Yes | Yes | No: shows as text |
| Rendered as a box on GitHub and in other editors | Yes | No: shows as `[P]` | Yes | No: shows as text |

The last two rows are the trade-off: `( )` is not standard Markdown, so outside Obsidian it is text.

## Without the plugin

The lines stay readable: `( ) Oat milk` and `(x) Coffee ✅ 2026-10-16` are plain text in any editor, on GitHub, in an export or on a phone without the plugin. To check an item there, type an `x` between the brackets. Nothing is stored outside your notes.

## Compatibility

- Works alongside Tasks, Dataview and any theme. Task plugins only read `[ ]`, so they never see checklist items.
- Desktop and mobile.
- Source mode shows the raw `( )` text, like it shows `[ ]`.
- Lines starting with `(a)` or `(1)` stay ordinary text: only `( )`, `(x)`, `(X)` and `(-)` are checklist items.
- In an embed or hover preview, a click finds the item's line by its text. If a note has two items with the same text under the same heading, a notice asks you to tick it in the note itself.

## Settings

Done dates, heading counts, the sticky progress bar, dimming of checked items and the status-bar count can each be turned off.

## Installation

Open **Settings → Community plugins → Browse**, search for **Checkboxes**, then select **Install** and **Enable**.

To install it by hand, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/adalach/obsidian-checkboxes/releases/latest) into `<vault>/.obsidian/plugins/checkboxes/` and turn it on under **Settings → Community plugins**. [BRAT](https://github.com/TfTHacker/obsidian42-brat) can install pre-releases from `adalach/obsidian-checkboxes`.

## FAQ

**Why parentheses?** `( )` mirrors `[ ]`, is quick to type, reads like a box in plain text, and is not used by Markdown or by any task plugin.

**Can I switch back?** Yes. Replace `( )` with `[ ]` and `(x)` with `[x]` with a find-and-replace; the ✅ dates are already in the Tasks format.

**Does it work with my grocery list template?** Yes. Templates are plain text, so write `- ( ) ` in them and every new list starts as a checklist.

## Development

Building from source, the tests and the code layout are described in [DEVELOPMENT.md](DEVELOPMENT.md).

## License

[MIT](LICENSE) © Agata Dalach
