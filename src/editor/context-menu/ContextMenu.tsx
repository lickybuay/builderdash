/**
 * The element context menu, as in Elementor: Duplicate, Copy, Paste, Copy
 * style, Paste style, Reset style, Delete.
 *
 * Opened at a viewport point: a right-click in the live preview (converted
 * from iframe coordinates), on a Structure row, or the Menu key / Shift+F10.
 * Custom rather than a kumo dropdown because it anchors to a point, not to a
 * trigger element.
 *
 * WAI-ARIA menu pattern: role=menu/menuitem, focus on the first item,
 * Up/Down/Home/End move, Enter/Space run, Esc and Tab close. Focus returns to
 * where it was. A click outside, a scroll, a resize or focus moving into the
 * preview (the window blurs) closes it.
 */

import * as React from "react";

export interface ContextMenuItem {
	id: string;
	label: string;
	/** Shown on the right and exposed as `aria-keyshortcuts`. */
	shortcut?: { label: string; aria: string };
	disabled?: boolean;
	danger?: boolean;
	/** Draws a separator above this item. */
	separated?: boolean;
	run: () => void;
}

interface ContextMenuProps {
	x: number;
	y: number;
	items: readonly ContextMenuItem[];
	label: string;
	onClose: () => void;
	/** Gets focus back when the menu closes. */
	returnFocus?: HTMLElement | null;
}

export function ContextMenu({ x, y, items, label, onClose, returnFocus }: ContextMenuProps): React.JSX.Element {
	const ref = React.useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = React.useState({ left: x, top: y });

	const close = React.useCallback(() => {
		onClose();
		returnFocus?.focus?.();
	}, [onClose, returnFocus]);

	// Kept inside the viewport.
	React.useLayoutEffect(() => {
		const menu = ref.current;
		if (!menu) return;
		const { width, height } = menu.getBoundingClientRect();
		setPosition({
			left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
			top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
		});
		menu.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
	}, [x, y]);

	React.useEffect(() => {
		const onPointer = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) onClose();
		};
		const dismiss = () => onClose();
		document.addEventListener("pointerdown", onPointer, true);
		window.addEventListener("blur", dismiss);
		window.addEventListener("resize", dismiss);
		window.addEventListener("scroll", dismiss, true);
		return () => {
			document.removeEventListener("pointerdown", onPointer, true);
			window.removeEventListener("blur", dismiss);
			window.removeEventListener("resize", dismiss);
			window.removeEventListener("scroll", dismiss, true);
		};
	}, [onClose]);

	const onKeyDown = (event: React.KeyboardEvent) => {
		const enabled = Array.from(
			ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
		);
		const at = enabled.indexOf(document.activeElement as HTMLElement);
		const focus = (index: number) => enabled[(index + enabled.length) % enabled.length]?.focus();
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				focus(at + 1);
				break;
			case "ArrowUp":
				event.preventDefault();
				focus(at - 1);
				break;
			case "Home":
				event.preventDefault();
				focus(0);
				break;
			case "End":
				event.preventDefault();
				focus(enabled.length - 1);
				break;
			case "Escape":
				event.preventDefault();
				close();
				break;
			case "Tab":
				event.preventDefault();
				close();
				break;
		}
		// The shell's shortcuts must not fire while the menu has focus.
		event.stopPropagation();
	};

	return (
		<div
			ref={ref}
			role="menu"
			aria-label={label}
			tabIndex={-1}
			onKeyDown={onKeyDown}
			onContextMenu={(event) => event.preventDefault()}
			style={{ position: "fixed", left: position.left, top: position.top, zIndex: 1000 }}
			className="min-w-56 rounded-lg border border-kumo-line bg-kumo-base py-1 text-sm text-kumo-default shadow-lg"
		>
			{items.map((item) => (
				<React.Fragment key={item.id}>
					{item.separated ? <div role="separator" className="my-1 border-t border-kumo-line" /> : null}
					<div
						role="menuitem"
						tabIndex={-1}
						aria-disabled={item.disabled || undefined}
						aria-keyshortcuts={item.shortcut?.aria}
						onClick={() => {
							if (item.disabled) return;
							onClose();
							item.run();
						}}
						onKeyDown={(event) => {
							if (item.disabled || (event.key !== "Enter" && event.key !== " ")) return;
							event.preventDefault();
							onClose();
							item.run();
						}}
						className={[
							"flex cursor-default items-center justify-between gap-6 px-3 py-1.5 outline-none",
							item.disabled
								? "text-kumo-subtle opacity-60"
								: "hover:bg-kumo-tint focus:bg-kumo-tint",
							item.danger && !item.disabled ? "text-kumo-danger" : "",
						].join(" ")}
					>
						<span>{item.label}</span>
						{item.shortcut ? (
							<span aria-hidden="true" className="text-xs text-kumo-subtle">
								{item.shortcut.label}
							</span>
						) : null}
					</div>
				</React.Fragment>
			))}
		</div>
	);
}
