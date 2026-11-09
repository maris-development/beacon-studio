/**
 * PlotMouse — the mouse controls of one uPlot chart, as in a desktop plot window.
 *
 * The layer reads every mouse press on the chart before uPlot does, and finds the
 * zone under the mouse first:
 *
 *   plot   left or middle drag moves the view, right drag or Shift+left drag
 *          zooms to a box, the wheel zooms at the pointer.
 *   axis   a drag stretches or squeezes the axis, Shift+drag moves it, the wheel
 *          zooms it, a click opens the axis editor.
 *   edge   a drag resizes the figure. A corner changes both sides.
 *
 * A double click resets the view of the zone. Esc cancels a drag. The arithmetic
 * of each step is in `plots/plot-view.ts`. The canvas owns the view and the
 * figure, so this class only calls back into {@link PlotMouseHost}.
 *
 * The overlays (the hovered zone, the zoom box, the size label) are runes. The
 * canvas draws them in its own markup, over the chart.
 */
import type uPlot from "uplot";
import {
    dragFigureSide,
    MIN_FIGURE,
    panRange,
    stretchFactor,
    WHEEL_ZOOM,
    zoomAround,
    zoomBoxOf,
    type PixelRect,
    type PlotView,
    type ViewAxis,
    type ViewKeep,
    type ViewRange
} from "@/plots/plot-view";

/** The distance from a plot edge, in pixels, that still counts as the edge. */
const EDGE = 5;

/** A move below this many pixels is a click, not a drag. */
const CLICK_SLOP = 3;

/** The wait before a click on an axis opens the editor. A double click within it resets the axis. */
const CLICK_DELAY = 260;

/** The browser menu stays closed this long after the release of a right drag, in milliseconds. */
const MENU_BLOCK_MS = 500;

type Side = -1 | 0 | 1;

type Zone =
    | { kind: "plot" }
    | { kind: "axis"; axis: ViewAxis; element: HTMLElement }
    | { kind: "edge"; sx: Side; sy: Side };

/** What the layer changes. The canvas implements it. */
export interface PlotMouseHost {
    /** The element whose size an edge drag changes. Its parent is the room it fits in. */
    figure: HTMLElement;
    /** Set the view. `keep` names the axis that the user changed. */
    setView(next: Partial<PlotView>, keep: ViewKeep): void;
    /** Go back to the home view: of one axis, or of both for null. */
    resetView(axis: ViewAxis | null): void;
    /** Resize the chart during an edge drag. */
    resizeFigure(width: number, height: number): void;
    /** Store the figure size. Null fills the panel on that side. A side that is absent stays. */
    commitFigure(size: { width?: number | null; height?: number | null }): void;
    /** Undo an edge drag. */
    restoreFigure(): void;
    openAxisEditor(axis: ViewAxis, element: HTMLElement): void;
    /** The legend group at a pixel of the chart, or null. */
    legendAt(x: number, y: number): string | null;
    /** Hide or show a group. `alone` shows the group alone, or all groups again. */
    toggleGroup(key: string, alone: boolean): void;
}

interface Drag {
    zone: Zone;
    start: { x: number; y: number };
    client: { x: number; y: number };
    moved: boolean;
    pan: boolean;
    box: boolean;
    /** The pixel of the press inside the plot area. */
    px: number;
    py: number;
    valueX: (pixel: number) => number;
    valueY: (pixel: number) => number;
    x0: ViewRange;
    y0: ViewRange;
    width0: number;
    height0: number;
    anchor: number;
    rect: { rect: PixelRect; keep: ViewKeep } | null;
    size: { width: number; height: number } | null;
}

export class PlotMouse {
    /** The axis or edge under the mouse, in pixels of the figure. */
    hover = $state<{ kind: "axis" | "edge"; rect: PixelRect } | null>(null);
    /** The zoom box of a right drag. */
    zoomBox = $state<PixelRect | null>(null);
    /** The figure size during an edge drag, and where to show it. */
    figureLabel = $state<{ width: number; height: number; x: number; y: number } | null>(null);
    /** True while a drag runs. The tooltip stays hidden. */
    dragging = $state(false);

    private detach: (() => void) | null = null;

    /** Take the mouse of a chart. A second call drops the chart before it. */
    attach(u: uPlot, host: PlotMouseHost, axisTitles: { x: string; y: string }): void {
        this.destroy();

        const over = u.over;
        const wrap = over.parentElement;
        if (!wrap) return;

        const axisElements = Array.from(wrap.querySelectorAll<HTMLElement>(":scope > .u-axis"));
        axisElements.forEach((element, i) => {
            if (i === 0) element.title = axisTitles.x;
            else element.title = axisTitles.y;
        });

        const box = (): PixelRect => ({
            left: over.offsetLeft,
            top: over.offsetTop,
            width: over.offsetWidth,
            height: over.offsetHeight
        });

        // The overlays draw in the figure, and the wrap sits inside it.
        const toFigure = (rect: PixelRect): PixelRect => ({
            ...rect,
            left: rect.left + wrap.offsetLeft,
            top: rect.top + wrap.offsetTop
        });

        const at = (event: MouseEvent) => {
            const bounds = wrap.getBoundingClientRect();
            return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        };

        const setCursor = (cursor: string) => {
            wrap.style.cursor = cursor;
            over.style.cursor = cursor;
        };

        // The edges come first, so the edge of the plot beside an axis still resizes the figure.
        const zoneAt = ({ x, y }: { x: number; y: number }): Zone | null => {
            const { left, top, width, height } = box();
            const alongY = y >= top - EDGE && y <= top + height + EDGE;
            const alongX = x >= left - EDGE && x <= left + width + EDGE;

            let sx: Side = 0;
            if (alongY && Math.abs(x - left) <= EDGE) sx = -1;
            else if (alongY && Math.abs(x - left - width) <= EDGE) sx = 1;

            let sy: Side = 0;
            if (alongX && Math.abs(y - top) <= EDGE) sy = -1;
            else if (alongX && Math.abs(y - top - height) <= EDGE) sy = 1;

            if (sx || sy) return { kind: "edge", sx, sy };

            for (let i = 0; i < axisElements.length && i < 2; i++) {
                const element = axisElements[i];
                const inside =
                    x >= element.offsetLeft &&
                    x <= element.offsetLeft + element.offsetWidth &&
                    y >= element.offsetTop &&
                    y <= element.offsetTop + element.offsetHeight;

                if (!inside) continue;

                let axis: ViewAxis = "y";
                if (i === 0) axis = "x";
                return { kind: "axis", axis, element };
            }

            if (x > left && x < left + width && y > top && y < top + height)
                return { kind: "plot" };
            return null;
        };

        // The value at a pixel of the plot area, with the scales at the start of the drag.
        const valueAt = (axis: ViewAxis): ((pixel: number) => number) => {
            const scale = u.scales[axis];
            const min = scale.min ?? 0;
            const max = scale.max ?? 1;
            let size = over.offsetHeight;
            if (axis === "x") size = over.offsetWidth;

            return (pixel) => {
                let t = pixel / size;
                if (axis === "y") t = 1 - t;
                if (scale.dir === -1) t = 1 - t;
                return min + t * (max - min);
            };
        };

        const showHover = (zone: Zone | null, shift: boolean) => {
            this.hover = null;

            if (!zone || zone.kind === "plot") {
                if (!zone) setCursor("");
                else if (shift) setCursor("crosshair");
                else setCursor("grab");
                return;
            }

            const { left, top, width, height } = box();

            if (zone.kind === "axis") {
                const element = zone.element;
                if (shift) setCursor("grab");
                else if (zone.axis === "x") setCursor("ew-resize");
                else setCursor("ns-resize");

                this.hover = {
                    kind: "axis",
                    rect: toFigure({
                        left: element.offsetLeft,
                        top: element.offsetTop,
                        width: element.offsetWidth,
                        height: element.offsetHeight
                    })
                };
                return;
            }

            if (zone.sx && zone.sy) {
                if (zone.sx === zone.sy) setCursor("nwse-resize");
                else setCursor("nesw-resize");
            } else if (zone.sx) {
                setCursor("ew-resize");
            } else {
                setCursor("ns-resize");
            }

            // The edge line, or a square on a corner.
            let edgeX = left;
            if (zone.sx > 0) edgeX = left + width;
            let edgeY = top;
            if (zone.sy > 0) edgeY = top + height;

            let rect: PixelRect;
            if (zone.sx && zone.sy) {
                rect = { left: edgeX - 5, top: edgeY - 5, width: 10, height: 10 };
            } else if (zone.sx) {
                rect = { left: edgeX - 1, top, width: 2, height };
            } else {
                rect = { left, top: edgeY - 1, width, height: 2 };
            }

            this.hover = { kind: "edge", rect: toFigure(rect) };
        };

        let drag: Drag | null = null;
        let frame = 0;
        let clickTimer: ReturnType<typeof setTimeout> | undefined;

        const step = (
            current: Drag,
            point: { x: number; y: number },
            client: { x: number; y: number }
        ) => {
            const zone = current.zone;

            if (current.box) {
                current.rect = zoomBoxOf(current.start, point, box());
                this.zoomBox = toFigure(current.rect.rect);
                return;
            }

            if (zone.kind === "edge") {
                // The figure stays in the centre of the room, so a side grows two times the move.
                const room = host.figure.parentElement;
                if (!room) return;

                let width = current.width0;
                if (zone.sx) {
                    const move = zone.sx * (client.x - current.client.x);
                    width = dragFigureSide(
                        current.width0,
                        move,
                        MIN_FIGURE.width,
                        room.clientWidth
                    );
                }

                let height = current.height0;
                if (zone.sy) {
                    const move = zone.sy * (client.y - current.client.y);
                    height = dragFigureSide(
                        current.height0,
                        move,
                        MIN_FIGURE.height,
                        room.clientHeight
                    );
                }

                current.size = { width, height };
                host.resizeFigure(width, height);

                const area = toFigure(box());
                this.figureLabel = {
                    width: Math.round(width),
                    height: Math.round(height),
                    x: area.left + area.width / 2,
                    y: area.top + area.height / 2
                };
                return;
            }

            const dx = point.x - current.start.x;
            const dy = point.y - current.start.y;

            if (current.pan) {
                const next: Partial<PlotView> = {};

                if (zone.kind === "plot" || zone.axis === "x") {
                    const delta = current.valueX(current.px) - current.valueX(current.px + dx);
                    next.x = panRange(current.x0, delta);
                }

                if (zone.kind === "plot" || zone.axis === "y") {
                    const delta = current.valueY(current.py) - current.valueY(current.py + dy);
                    next.y = panRange(current.y0, delta);
                }

                if (zone.kind === "axis") host.setView(next, zone.axis);
                else host.setView(next, "both");
                return;
            }

            if (zone.kind !== "axis") return;

            // Right or up stretches the axis around the grabbed value. Left or down squeezes it.
            if (zone.axis === "x") {
                host.setView({ x: zoomAround(current.x0, current.anchor, stretchFactor(dx)) }, "x");
            } else {
                host.setView(
                    { y: zoomAround(current.y0, current.anchor, stretchFactor(-dy)) },
                    "y"
                );
            }
        };

        const onMove = (event: MouseEvent) => {
            const current = drag;
            if (!current) return;

            const point = at(event);
            const client = { x: event.clientX, y: event.clientY };
            const distance =
                Math.abs(client.x - current.client.x) + Math.abs(client.y - current.client.y);
            if (!current.moved && distance < CLICK_SLOP) return;

            current.moved = true;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                if (drag === current) step(current, point, client);
            });
        };

        const end = (event: MouseEvent | KeyboardEvent, cancel: boolean) => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.removeEventListener("keydown", onKey, true);
            cancelAnimationFrame(frame);

            const current = drag;
            drag = null;
            this.dragging = false;
            if (!current) return;

            this.zoomBox = null;
            this.figureLabel = null;

            let point: { x: number; y: number } | null = null;
            if (event instanceof MouseEvent) point = at(event);
            const hoverAgain = () => {
                if (point && !cancel) showHover(zoneAt(point), event.shiftKey);
                else showHover(null, false);
            };

            if (current.box) {
                const chosen = current.rect;
                if (
                    !cancel &&
                    current.moved &&
                    chosen &&
                    chosen.rect.width > 3 &&
                    chosen.rect.height > 3
                ) {
                    const area = box();
                    const r = chosen.rect;
                    const span = (a: number, b: number): ViewRange => ({
                        min: Math.min(a, b),
                        max: Math.max(a, b)
                    });

                    const next: Partial<PlotView> = {};
                    if (chosen.keep !== "y") {
                        next.x = span(
                            current.valueX(r.left - area.left),
                            current.valueX(r.left + r.width - area.left)
                        );
                    }
                    if (chosen.keep !== "x") {
                        next.y = span(
                            current.valueY(r.top - area.top),
                            current.valueY(r.top + r.height - area.top)
                        );
                    }

                    host.setView(next, chosen.keep);
                }

                hoverAgain();
                return;
            }

            if (cancel) {
                if (current.moved && current.zone.kind === "edge") host.restoreFigure();
                else if (current.moved) host.setView({ x: current.x0, y: current.y0 }, "both");
                showHover(null, false);
                return;
            }

            if (!current.moved) {
                const zone = current.zone;
                if (zone.kind === "axis") {
                    clearTimeout(clickTimer);
                    clickTimer = setTimeout(
                        () => host.openAxisEditor(zone.axis, zone.element),
                        CLICK_DELAY
                    );
                }
                hoverAgain();
                return;
            }

            // The last step sets the size label again, so the label clears after it.
            if (point && event instanceof MouseEvent) {
                step(current, point, { x: event.clientX, y: event.clientY });
            }
            this.figureLabel = null;

            const zone = current.zone;
            if (zone.kind === "edge" && current.size) {
                // A side at the size of the room fills the panel again, so it follows the panel.
                const room = host.figure.parentElement;
                const size: { width?: number | null; height?: number | null } = {};

                if (room && zone.sx) {
                    if (current.size.width >= room.clientWidth - 1) size.width = null;
                    else size.width = Math.round(current.size.width);
                }

                if (room && zone.sy) {
                    if (current.size.height >= room.clientHeight - 1) size.height = null;
                    else size.height = Math.round(current.size.height);
                }

                host.commitFigure(size);
            }

            hoverAgain();
        };

        const onUp = (event: MouseEvent) => end(event, false);

        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            end(event, true);
        };

        // A right drag blocks the browser menu until just after the release, or until a new press.
        let rightHeld = false;
        let menuBlockedUntil = 0;

        const onAnyDown = () => {
            rightHeld = false;
        };

        const onAnyUp = (event: MouseEvent) => {
            if (event.button !== 2 || !rightHeld) return;
            rightHeld = false;
            menuBlockedUntil = performance.now() + MENU_BLOCK_MS;
        };

        const onAnyMenu = (event: MouseEvent) => {
            if (rightHeld || performance.now() < menuBlockedUntil) event.preventDefault();
        };

        const onDown = (event: MouseEvent) => {
            if (event.button > 2) return;

            const point = at(event);
            const zone = zoneAt(point);
            if (!zone || (zone.kind !== "plot" && event.button === 2)) return;

            let mode: "pan" | "box" | null = null;
            if (zone.kind === "plot") {
                if (event.button === 2 || (event.button === 0 && event.shiftKey)) mode = "box";
                else mode = "pan";
            }

            event.preventDefault();
            event.stopPropagation();

            if (event.button === 2) rightHeld = true;

            const area = box();
            let pan = mode === "pan";
            if (zone.kind === "axis") pan = event.shiftKey || event.button === 1;

            const current: Drag = {
                zone,
                start: point,
                client: { x: event.clientX, y: event.clientY },
                moved: false,
                pan,
                box: mode === "box",
                px: point.x - area.left,
                py: point.y - area.top,
                valueX: valueAt("x"),
                valueY: valueAt("y"),
                x0: { min: u.scales.x.min ?? 0, max: u.scales.x.max ?? 1 },
                y0: { min: u.scales.y.min ?? 0, max: u.scales.y.max ?? 1 },
                width0: host.figure.offsetWidth,
                height0: host.figure.offsetHeight,
                anchor: 0,
                rect: null,
                size: null
            };

            if (zone.kind === "axis") {
                if (zone.axis === "x") current.anchor = current.valueX(current.px);
                else current.anchor = current.valueY(current.py);
            }

            if (current.pan) setCursor("grabbing");
            else if (current.box) setCursor("crosshair");

            drag = current;
            this.dragging = true;

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            document.addEventListener("keydown", onKey, true);
        };

        const onContextMenu = (event: MouseEvent) => {
            if (zoneAt(at(event))?.kind === "plot") event.preventDefault();
        };

        const onClick = (event: MouseEvent) => {
            const point = at(event);
            const key = host.legendAt(point.x, point.y);
            if (key !== null) host.toggleGroup(key, false);
        };

        const onHover = (event: MouseEvent) => {
            if (drag) return;

            const point = at(event);
            if (host.legendAt(point.x, point.y) !== null) {
                this.hover = null;
                setCursor("pointer");
                return;
            }

            showHover(zoneAt(point), event.shiftKey);
        };

        const onLeave = () => {
            if (!drag) showHover(null, false);
        };

        // The wheel zooms at the pointer: one axis on an axis, both axes elsewhere.
        const onWheel = (event: WheelEvent) => {
            const point = at(event);
            const zone = zoneAt(point);
            if (!zone) return;

            event.preventDefault();

            let factor = 1 / WHEEL_ZOOM;
            if (event.deltaY < 0) factor = WHEEL_ZOOM;

            const area = box();
            const zoom = (axis: ViewAxis): ViewRange => {
                const scale = u.scales[axis];
                let pixel = point.y - area.top;
                if (axis === "x") pixel = point.x - area.left;

                const anchor = u.posToVal(pixel, axis);
                return zoomAround({ min: scale.min ?? 0, max: scale.max ?? 1 }, anchor, factor);
            };

            if (zone.kind === "axis") host.setView({ [zone.axis]: zoom(zone.axis) }, zone.axis);
            else host.setView({ x: zoom("x"), y: zoom("y") }, "both");
        };

        // A double click resets the view of the zone. On an edge, that side fills the panel again.
        const onDoubleClick = (event: MouseEvent) => {
            const point = at(event);
            const key = host.legendAt(point.x, point.y);

            if (key !== null) {
                event.preventDefault();
                event.stopPropagation();
                host.toggleGroup(key, true);
                return;
            }

            const zone = zoneAt(point);
            if (!zone) return;

            event.preventDefault();
            event.stopPropagation();
            clearTimeout(clickTimer);

            if (zone.kind === "edge") {
                const size: { width?: null; height?: null } = {};
                if (zone.sx) size.width = null;
                if (zone.sy) size.height = null;
                host.commitFigure(size);
                return;
            }

            if (zone.kind === "plot") host.resetView(null);
            else host.resetView(zone.axis);
        };

        wrap.addEventListener("mousedown", onDown, true);
        wrap.addEventListener("contextmenu", onContextMenu);
        wrap.addEventListener("click", onClick);
        wrap.addEventListener("mousemove", onHover);
        wrap.addEventListener("mouseleave", onLeave);
        wrap.addEventListener("wheel", onWheel, { passive: false });
        wrap.addEventListener("dblclick", onDoubleClick, true);
        document.addEventListener("mousedown", onAnyDown, true);
        document.addEventListener("mouseup", onAnyUp, true);
        document.addEventListener("contextmenu", onAnyMenu, true);

        this.detach = () => {
            clearTimeout(clickTimer);
            cancelAnimationFrame(frame);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.removeEventListener("keydown", onKey, true);
            wrap.removeEventListener("mousedown", onDown, true);
            wrap.removeEventListener("contextmenu", onContextMenu);
            wrap.removeEventListener("click", onClick);
            wrap.removeEventListener("mousemove", onHover);
            wrap.removeEventListener("mouseleave", onLeave);
            wrap.removeEventListener("wheel", onWheel);
            wrap.removeEventListener("dblclick", onDoubleClick, true);
            document.removeEventListener("mousedown", onAnyDown, true);
            document.removeEventListener("mouseup", onAnyUp, true);
            document.removeEventListener("contextmenu", onAnyMenu, true);
        };
    }

    /** Let the chart go. The chart calls this before it is destroyed. */
    destroy(): void {
        this.detach?.();
        this.detach = null;
        this.hover = null;
        this.zoomBox = null;
        this.figureLabel = null;
        this.dragging = false;
    }
}
