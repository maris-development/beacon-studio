import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type uPlot from "uplot";
import { PlotMouse, type PlotMouseHost } from "../PlotMouse.svelte";

function sized(element: HTMLElement, left: number, top: number, width: number, height: number) {
    Object.defineProperty(element, "offsetLeft", { value: left });
    Object.defineProperty(element, "offsetTop", { value: top });
    Object.defineProperty(element, "offsetWidth", { value: width });
    Object.defineProperty(element, "offsetHeight", { value: height });
}

function makeChart() {
    const figure = document.createElement("div");
    const wrap = document.createElement("div");
    const over = document.createElement("div");
    wrap.appendChild(over);
    figure.appendChild(wrap);
    document.body.appendChild(figure);

    sized(wrap, 0, 0, 100, 100);
    sized(over, 0, 0, 100, 100);
    wrap.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

    const u = {
        over,
        scales: { x: { min: 0, max: 100, dir: 1 }, y: { min: 0, max: 100, dir: 1 } }
    } as unknown as uPlot;

    const host: PlotMouseHost = {
        figure,
        setView: vi.fn(),
        resetView: vi.fn(),
        resizeFigure: vi.fn(),
        commitFigure: vi.fn(),
        restoreFigure: vi.fn(),
        openAxisEditor: vi.fn(),
        legendAt: () => null,
        toggleGroup: vi.fn()
    };

    return { wrap, u, host };
}

const closeTo = (value: number) => expect.closeTo(value, 9);

function mouse(type: string, x: number, y: number, button = 2) {
    return new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button,
        bubbles: true,
        cancelable: true
    });
}

describe("PlotMouse zoom box", () => {
    let frames: FrameRequestCallback[];

    beforeEach(() => {
        frames = [];
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            frames.push(callback);
            return frames.length;
        });
        vi.stubGlobal("cancelAnimationFrame", () => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    const flush = () => frames.splice(0).forEach((callback) => callback(0));

    it("zooms to the release point when no frame ran", () => {
        const { wrap, u, host } = makeChart();
        const plotMouse = new PlotMouse();
        plotMouse.attach(u, host, { x: "x", y: "y" });

        wrap.dispatchEvent(mouse("mousedown", 20, 20));
        document.dispatchEvent(mouse("mousemove", 60, 60));
        document.dispatchEvent(mouse("mouseup", 80, 70));

        expect(host.setView).toHaveBeenCalledWith(
            { x: { min: 20, max: 80 }, y: { min: closeTo(30), max: closeTo(80) } },
            "both"
        );
        expect(plotMouse.zoomBox).toBeNull();
        plotMouse.destroy();
    });

    it("zooms to the release point, not to the box of the last frame", () => {
        const { wrap, u, host } = makeChart();
        const plotMouse = new PlotMouse();
        plotMouse.attach(u, host, { x: "x", y: "y" });

        wrap.dispatchEvent(mouse("mousedown", 20, 20));
        document.dispatchEvent(mouse("mousemove", 60, 60));
        flush();
        expect(plotMouse.zoomBox).toEqual({ left: 20, top: 20, width: 40, height: 40 });

        document.dispatchEvent(mouse("mousemove", 80, 70));
        document.dispatchEvent(mouse("mouseup", 80, 70));

        expect(host.setView).toHaveBeenCalledWith(
            { x: { min: 20, max: 80 }, y: { min: closeTo(30), max: closeTo(80) } },
            "both"
        );
        expect(plotMouse.zoomBox).toBeNull();
        plotMouse.destroy();
    });

    it("does not zoom after Esc", () => {
        const { wrap, u, host } = makeChart();
        const plotMouse = new PlotMouse();
        plotMouse.attach(u, host, { x: "x", y: "y" });

        wrap.dispatchEvent(mouse("mousedown", 20, 20));
        document.dispatchEvent(mouse("mousemove", 60, 60));
        flush();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(host.setView).not.toHaveBeenCalled();
        expect(plotMouse.zoomBox).toBeNull();
        plotMouse.destroy();
    });
});
