/**
 * Keyboard shortcuts of the element context menu, shared by the shell and the
 * live preview (each listens on its own document; focus lives in only one).
 *
 * None fires while typing: in a field, in a contenteditable (inline text
 * editing), or with text selected for Copy / Paste — the browser's own copy and
 * paste must keep working there.
 */

export type ElementShortcut = "duplicate" | "copy" | "paste" | "pasteStyle" | "delete";

/**
 * The element action a key press asks for, or `null`. `editing` is `true` when
 * focus is in a field or an editable element.
 */
export function elementShortcut(
	event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
	editing: boolean,
	selection: Pick<Selection, "isCollapsed"> | null,
): ElementShortcut | null {
	if (editing || event.altKey) return null;
	const mod = event.metaKey || event.ctrlKey;
	const key = event.key.toLowerCase();
	const textSelected = !!selection && !selection.isCollapsed;
	if (!mod) {
		return !event.shiftKey && (event.key === "Delete" || event.key === "Backspace") ? "delete" : null;
	}
	if (key === "d" && !event.shiftKey) return "duplicate";
	if (textSelected) return null;
	if (key === "c" && !event.shiftKey) return "copy";
	if (key === "v") return event.shiftKey ? "pasteStyle" : "paste";
	return null;
}
