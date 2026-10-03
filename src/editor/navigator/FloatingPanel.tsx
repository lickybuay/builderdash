/**
 * A panel floating over the canvas, moved by its header.
 *
 * Dragging uses pointer capture plus a full-window shield, because the live
 * preview is an iframe: without them the pointer events stop the moment the
 * cursor crosses it and the panel sticks to the mouse.
 *
 * The position is remembered per browser and always kept inside the canvas,
 * which changes width when the side panels or the device change. A double
 * click on the header puts it back in its default corner.
 */

import * as React from "react";

export interface FloatingPosition {
	x: number;
	y: number;
}

const MARGIN = 12;
/** Height of the header that must stay reachable. */
const GRIP = 40;

/** Keeps the panel inside the area: its header always reachable. */
export function clampPosition(
	position: FloatingPosition,
	panel: { width: number },
	area: { width: number; height: number },
): FloatingPosition {
	return {
		x: Math.round(Math.min(Math.max(0, position.x), Math.max(0, area.width - panel.width))),
		y: Math.round(Math.min(Math.max(0, position.y), Math.max(0, area.height - GRIP))),
	};
}

export function FloatingPanel({
	storageKey,
	width,
	children,
}: {
	storageKey: string;
	width: number;
	/** Renders the panel; spread `handleProps` on the element that moves it. */
	children: (handleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}): React.JSX.Element {
	const ref = React.useRef<HTMLDivElement | null>(null);
	const [area, setArea] = React.useState({ width: 0, height: 0 });
	const [stored, setStored] = React.useState<FloatingPosition | null>(() => readPosition(storageKey));
	const [dragging, setDragging] = React.useState(false);
	const start = React.useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);

	// Follow the canvas size: side panels and devices change it.
	React.useLayoutEffect(() => {
		const parent = ref.current?.parentElement;
		if (!parent) return;
		const measure = () => setArea({ width: parent.clientWidth, height: parent.clientHeight });
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(parent);
		return () => observer.disconnect();
	}, []);

	const fallback = { x: area.width - width - MARGIN, y: MARGIN };
	const position = clampPosition(stored ?? fallback, { width }, area);

	const save = (next: FloatingPosition | null) => {
		setStored(next);
		try {
			if (next) window.localStorage.setItem(storageKey, JSON.stringify(next));
			else window.localStorage.removeItem(storageKey);
		} catch {
			// Not persisted; the panel still moves for this session.
		}
	};

	const handleProps: React.HTMLAttributes<HTMLElement> = {
		onPointerDown: (event) => {
			if (event.button !== 0) return;
			// Buttons and inputs in the header keep working.
			if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
			event.preventDefault();
			event.currentTarget.setPointerCapture(event.pointerId);
			start.current = { pointerX: event.clientX, pointerY: event.clientY, ...position };
			setDragging(true);
		},
		onPointerMove: (event) => {
			const from = start.current;
			if (!from) return;
			setStored(
				clampPosition(
					{ x: from.x + event.clientX - from.pointerX, y: from.y + event.clientY - from.pointerY },
					{ width },
					area,
				),
			);
		},
		onPointerUp: (event) => {
			if (!start.current) return;
			start.current = null;
			setDragging(false);
			event.currentTarget.releasePointerCapture(event.pointerId);
			save(position);
		},
		onPointerCancel: () => {
			start.current = null;
			setDragging(false);
		},
		onDoubleClick: (event) => {
			if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
			save(null);
		},
		style: { cursor: dragging ? "grabbing" : "grab", touchAction: "none", userSelect: "none" },
	};

	return (
		<>
			{dragging ? <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 40, cursor: "grabbing" }} /> : null}
			<div
				ref={ref}
				style={{
					position: "absolute",
					left: position.x,
					top: position.y,
					width,
					maxHeight: Math.max(160, area.height - position.y - MARGIN),
					zIndex: 41,
					display: "flex",
					visibility: area.width ? "visible" : "hidden",
				}}
				className="overflow-hidden rounded-lg border border-kumo-line shadow-lg"
			>
				{children(handleProps)}
			</div>
		</>
	);
}

function readPosition(storageKey: string): FloatingPosition | null {
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<FloatingPosition>;
		return typeof parsed.x === "number" && typeof parsed.y === "number" ? { x: parsed.x, y: parsed.y } : null;
	} catch {
		return null;
	}
}
