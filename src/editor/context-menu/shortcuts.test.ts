/**
 * Element shortcut tests: which key press asks for which action, and when the
 * browser's own behavior must win (typing, text selected).
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { elementShortcut } from "./shortcuts";

type Keys = Parameters<typeof elementShortcut>[0];

function press(key: string, modifiers: Partial<Keys> = {}): Keys {
	return { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...modifiers };
}

const collapsed = { isCollapsed: true };
const selected = { isCollapsed: false };

describe("elementShortcut", () => {
	it("maps the mod shortcuts, with Cmd or Ctrl", () => {
		for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
			expect(elementShortcut(press("d", mod), false, collapsed)).toBe("duplicate");
			expect(elementShortcut(press("c", mod), false, collapsed)).toBe("copy");
			expect(elementShortcut(press("v", mod), false, collapsed)).toBe("paste");
			expect(elementShortcut(press("V", { ...mod, shiftKey: true }), false, collapsed)).toBe("pasteStyle");
		}
	});

	it("deletes with Delete or Backspace", () => {
		expect(elementShortcut(press("Delete"), false, collapsed)).toBe("delete");
		expect(elementShortcut(press("Backspace"), false, null)).toBe("delete");
		expect(elementShortcut(press("Delete", { shiftKey: true }), false, collapsed)).toBeNull();
	});

	it("does nothing while editing", () => {
		expect(elementShortcut(press("Delete"), true, collapsed)).toBeNull();
		expect(elementShortcut(press("d", { metaKey: true }), true, collapsed)).toBeNull();
		expect(elementShortcut(press("v", { metaKey: true }), true, collapsed)).toBeNull();
	});

	it("leaves copy and paste to the browser with text selected, but still duplicates", () => {
		expect(elementShortcut(press("c", { metaKey: true }), false, selected)).toBeNull();
		expect(elementShortcut(press("v", { metaKey: true }), false, selected)).toBeNull();
		expect(elementShortcut(press("v", { metaKey: true, shiftKey: true }), false, selected)).toBeNull();
		expect(elementShortcut(press("d", { metaKey: true }), false, selected)).toBe("duplicate");
	});

	it("ignores alt", () => {
		expect(elementShortcut(press("d", { metaKey: true, altKey: true }), false, collapsed)).toBeNull();
		expect(elementShortcut(press("Delete", { altKey: true }), false, collapsed)).toBeNull();
	});

	it("ignores other keys, and shift+d", () => {
		expect(elementShortcut(press("x", { metaKey: true }), false, collapsed)).toBeNull();
		expect(elementShortcut(press("d", { metaKey: true, shiftKey: true }), false, collapsed)).toBeNull();
		expect(elementShortcut(press("d"), false, collapsed)).toBeNull();
	});
});
