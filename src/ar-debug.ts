import { Capacitor } from "@capacitor/core";
import type * as THREE from "three";

export type ARPath = "native" | "webxr" | "quicklook" | "android-chrome" | "preview-only";

export interface CompatSnapshot {
  arPath: ARPath;
  webxrSupported: boolean;
  quickLookSupported: boolean;
  platform: string;
  nativeShell: boolean;
  secureContext: boolean;
  protocol: string;
  hostname: string;
  arOrigin: string | null;
  userAgent: string;
  devicePixelRatio: number;
  viewport: string;
}

export interface CompatProbeInput {
  arPath: ARPath;
  webxrSupported: boolean;
  quickLookSupported: boolean;
  arOrigin?: string | null;
}

export function buildCompatSnapshot(input: CompatProbeInput): CompatSnapshot {
  const ua = navigator.userAgent;
  return {
    arPath: input.arPath,
    webxrSupported: input.webxrSupported,
    quickLookSupported: input.quickLookSupported,
    platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "browser",
    nativeShell: Capacitor.isNativePlatform(),
    secureContext: window.isSecureContext,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    arOrigin: input.arOrigin ?? null,
    userAgent: ua.length > 80 ? ua.slice(0, 77) + "…" : ua,
    devicePixelRatio: window.devicePixelRatio,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
  };
}

const EVENT_LOG_MAX = 5;
const FPS_SAMPLES = 30;
const PANEL_INTERVAL_MS = 100;
const ENTER_MS = 420;

type ChipTone = "live" | "warn" | "dim";

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function fmtVec3(v: THREE.Vector3): string {
  return `${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}`;
}

function planeLabel(plane: XRPlane | undefined): string {
  if (!plane) return "n/a";
  const alignment = plane.orientation === "horizontal" ? "horizontal" : "vertical";
  return `${alignment} (${plane.planeSpace ? "tracked" : "unknown"})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chipTone(value: string | undefined, kind: "yesno" | "tracking" | "path"): ChipTone {
  const v = (value ?? "").toLowerCase();
  if (kind === "yesno") {
    if (v === "yes" || v === "tracking") return "live";
    if (v === "no" || v === "lost") return "warn";
    return "dim";
  }
  if (kind === "tracking") {
    if (v.includes("track") || v === "normal" || v === "limited") return "live";
    if (v.includes("lost") || v.includes("not") || v === "none" || v === "stopped") return "warn";
    return "dim";
  }
  return v && v !== "—" ? "live" : "dim";
}

export class DebugCollector {
  private readonly panel: HTMLElement;
  private readonly snapshot: CompatSnapshot;
  private readonly sessionStart: number;
  private enabled = false;
  private enterActive = false;
  private enterTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPanelUpdate = 0;
  private lastFrameTime = 0;
  private frameDeltas: number[] = [];
  private events: string[] = [];
  private domOverlayActive = false;
  private hitTestActive = false;
  private referenceSpaceType = "local";

  constructor(panel: HTMLElement, snapshot: CompatSnapshot) {
    this.panel = panel;
    this.snapshot = snapshot;
    this.sessionStart = performance.now();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.enterTimer) {
      clearTimeout(this.enterTimer);
      this.enterTimer = null;
    }
    if (on) {
      this.enterActive = true;
      // Hold live rebuilds so enter motion is not restarted by 10 Hz ticks.
      this.lastPanelUpdate = performance.now() + ENTER_MS;
      this.renderPanel(this.collectStatic());
      this.enterTimer = setTimeout(() => {
        this.enterActive = false;
        this.enterTimer = null;
        const hud = this.panel.querySelector(".ar-debug-hud");
        hud?.removeAttribute("data-enter");
      }, ENTER_MS);
    } else {
      this.enterActive = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setSessionMeta(meta: {
    domOverlayActive: boolean;
    hitTestActive: boolean;
    referenceSpaceType: string;
  }): void {
    this.domOverlayActive = meta.domOverlayActive;
    this.hitTestActive = meta.hitTestActive;
    this.referenceSpaceType = meta.referenceSpaceType;
  }

  logEvent(message: string): void {
    const t = ((performance.now() - this.sessionStart) / 1000).toFixed(1);
    this.events.unshift(`+${t}s ${message}`);
    if (this.events.length > EVENT_LOG_MAX) this.events.length = EVENT_LOG_MAX;
  }

  bindSession(session: XRSession): () => void {
    const onVisibility = () =>
      this.logEvent(`visibility → ${session.visibilityState}`);
    const onInputs = () =>
      this.logEvent(`inputs → ${session.inputSources.length} source(s)`);
    const onEnd = () => this.logEvent("session end");

    session.addEventListener("visibilitychange", onVisibility);
    session.addEventListener("inputsourceschange", onInputs);
    session.addEventListener("end", onEnd);

    return () => {
      session.removeEventListener("visibilitychange", onVisibility);
      session.removeEventListener("inputsourceschange", onInputs);
      session.removeEventListener("end", onEnd);
    };
  }

  tick(input: {
    frame: XRFrame;
    session: XRSession;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    reticle: THREE.Mesh;
    hits: XRHitTestResult[];
    placed: number;
    surfaceFound: boolean;
    referenceSpace: XRReferenceSpace | null;
    reticlePos: THREE.Vector3;
  }): void {
    if (!this.enabled) return;

    const now = performance.now();
    if (this.lastFrameTime > 0) {
      this.frameDeltas.push(now - this.lastFrameTime);
      if (this.frameDeltas.length > FPS_SAMPLES) this.frameDeltas.shift();
    }
    this.lastFrameTime = now;

    if (now - this.lastPanelUpdate < PANEL_INTERVAL_MS) return;
    this.lastPanelUpdate = now;

    const avgDelta =
      this.frameDeltas.length > 0
        ? this.frameDeltas.reduce((a, b) => a + b, 0) / this.frameDeltas.length
        : 0;
    const fps = avgDelta > 0 ? 1000 / avgDelta : 0;

    const { frame, session, renderer, scene, reticle, hits, placed, surfaceFound, referenceSpace, reticlePos } =
      input;

    const viewerPose = referenceSpace ? frame.getViewerPose(referenceSpace) : null;
    const firstHit = hits[0];
    const plane =
      firstHit && "getPlane" in firstHit
        ? (firstHit as XRHitTestResult & { getPlane?: () => XRPlane | undefined }).getPlane?.()
        : undefined;

    const info = renderer.info.render;
    const canvas = renderer.domElement;

    this.renderPanel({
      fps: fmt(fps, 1),
      frameMs: fmt(avgDelta, 1),
      elapsed: fmt((now - this.sessionStart) / 1000, 1),
      surfaceInView: reticle.visible ? "yes" : "no",
      hitCount: String(hits.length),
      surfaceEverFound: surfaceFound ? "yes" : "no",
      reticlePos: reticle.visible ? fmtVec3(reticlePos) : "—",
      plane: planeLabel(plane),
      visibility: session.visibilityState,
      inputSources: String(session.inputSources.length),
      viewerTracking: viewerPose ? "tracking" : "lost",
      referenceSpace: this.referenceSpaceType,
      domOverlay: this.domOverlayActive ? "yes" : "no",
      hitTest: this.hitTestActive ? "yes" : "no",
      placed: String(placed),
      sceneChildren: String(scene.children.length),
      drawCalls: String(info.calls),
      triangles: String(info.triangles),
      points: String(info.points),
      geometries: String(renderer.info.memory.geometries),
      textures: String(renderer.info.memory.textures),
      canvasSize: `${canvas.width}×${canvas.height}`,
      dpr: String(window.devicePixelRatio),
    });
  }

  tickNative(input: {
    tracking: string;
    message: string;
    placed: number;
    backend: string;
  }): void {
    if (!this.enabled) return;

    const now = performance.now();
    if (now - this.lastPanelUpdate < PANEL_INTERVAL_MS) return;
    this.lastPanelUpdate = now;

    this.renderPanel({
      elapsed: fmt((now - this.sessionStart) / 1000, 1),
      tracking: input.tracking,
      trackingMessage: input.message,
      backend: input.backend,
      placed: String(input.placed),
      referenceSpace: "native",
      domOverlay: "yes",
      hitTest: "yes",
      mode: "native-ar",
    });
  }

  private collectStatic(): Record<string, string> {
    const s = this.snapshot;
    return {
      arPath: s.arPath,
      webxr: s.webxrSupported ? "yes" : "no",
      quickLook: s.quickLookSupported ? "yes" : "no",
      platform: s.platform,
      nativeShell: s.nativeShell ? "yes" : "no",
      secureContext: s.secureContext ? "yes" : "no",
      origin: `${s.protocol}//${s.hostname}`,
      viteArOrigin: s.arOrigin ?? "unset",
      viewport: s.viewport,
      userAgent: s.userAgent,
    };
  }

  private renderSection(title: string, rows: Record<string, string>): string {
    let html = `<section class="ar-debug-section"><h3>${escapeHtml(title)}</h3><dl>`;
    for (const [key, value] of Object.entries(rows)) {
      html += `<div class="ar-debug-row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`;
    }
    html += "</dl></section>";
    return html;
  }

  private renderChip(label: string, value: string, tone: ChipTone): string {
    return `<span class="ar-debug-chip ar-debug-chip--${tone}"><span class="ar-debug-chip__label">${escapeHtml(label)}</span><span class="ar-debug-chip__value">${escapeHtml(value)}</span></span>`;
  }

  private renderTopRail(live: Record<string, string>, staticRows: Record<string, string>): string {
    const isNative = (live.mode ?? "") === "native-ar" || Boolean(live.tracking && !live.fps);
    const heroLabel = isNative ? "TRK" : "FPS";
    const heroValue = isNative
      ? (live.tracking ?? "—")
      : (live.fps ?? "—");
    const heroTone: ChipTone = isNative
      ? chipTone(live.tracking, "tracking")
      : Number(live.fps) > 0
        ? "live"
        : "dim";

    const chips: string[] = [
      this.renderChip("PATH", staticRows.arPath ?? "—", chipTone(staticRows.arPath, "path")),
    ];

    if (isNative) {
      chips.push(
        this.renderChip("BE", live.backend ?? "—", chipTone(live.backend, "path")),
        this.renderChip("HIT", live.hitTest ?? "—", chipTone(live.hitTest, "yesno")),
      );
    } else {
      chips.push(
        this.renderChip("TRK", live.viewerTracking ?? "—", chipTone(live.viewerTracking, "yesno")),
        this.renderChip("HIT", live.surfaceInView ?? "—", chipTone(live.surfaceInView, "yesno")),
        this.renderChip("SURF", live.surfaceEverFound ?? "—", chipTone(live.surfaceEverFound, "yesno")),
      );
    }

    chips.push(this.renderChip("T", `${live.elapsed ?? "—"}s`, "dim"));

    return `<header class="ar-debug-rail ar-debug-rail--top">
      <div class="ar-debug-hero ar-debug-hero--${heroTone}">
        <span class="ar-debug-hero__label">${heroLabel}</span>
        <span class="ar-debug-hero__value">${escapeHtml(heroValue)}</span>
      </div>
      <div class="ar-debug-chips">${chips.join("")}</div>
    </header>`;
  }

  private renderEventsTicker(): string {
    if (this.events.length === 0) {
      return `<footer class="ar-debug-rail ar-debug-rail--bottom"><span class="ar-debug-ticker ar-debug-ticker--empty">EVT — waiting</span></footer>`;
    }
    let items = "";
    for (const ev of this.events) {
      items += `<li>${escapeHtml(ev)}</li>`;
    }
    return `<footer class="ar-debug-rail ar-debug-rail--bottom"><ul class="ar-debug-ticker">${items}</ul></footer>`;
  }

  private renderPanel(live: Record<string, string>): void {
    const staticRows = this.collectStatic();
    const enterAttr = this.enterActive ? ` data-enter="true"` : "";

    const left = [
      this.renderSection("Compat", staticRows),
      this.renderSection("Surfaces", {
        surfaceInView: live.surfaceInView ?? "—",
        hitCount: live.hitCount ?? "—",
        surfaceEverFound: live.surfaceEverFound ?? "—",
        reticlePos: live.reticlePos ?? "—",
        plane: live.plane ?? "n/a",
      }),
    ].join("");

    const right = [
      this.renderSection("Session", {
        mode: live.mode ?? "immersive-ar",
        backend: live.backend ?? "—",
        tracking: live.tracking ?? "—",
        trackingMessage: live.trackingMessage ?? "—",
        visibility: live.visibility ?? "—",
        inputSources: live.inputSources ?? "—",
        viewerTracking: live.viewerTracking ?? "—",
        referenceSpace: live.referenceSpace ?? "local",
        domOverlay: live.domOverlay ?? "—",
        hitTest: live.hitTest ?? "—",
        frameMs: live.frameMs ?? "—",
      }),
      this.renderSection("Scene", {
        placedCubes: live.placed ?? "0",
        sceneChildren: live.sceneChildren ?? "—",
        drawCalls: live.drawCalls ?? "—",
        triangles: live.triangles ?? "—",
        points: live.points ?? "—",
        geometries: live.geometries ?? "—",
        textures: live.textures ?? "—",
        canvas: live.canvasSize ?? "—",
        dpr: live.dpr ?? "—",
      }),
    ].join("");

    this.panel.innerHTML = `<div class="ar-debug-hud" data-active="true"${enterAttr}>
      <div class="ar-debug-frame" aria-hidden="true">
        <span class="ar-debug-bracket ar-debug-bracket--tl"></span>
        <span class="ar-debug-bracket ar-debug-bracket--tr"></span>
        <span class="ar-debug-bracket ar-debug-bracket--bl"></span>
        <span class="ar-debug-bracket ar-debug-bracket--br"></span>
        <span class="ar-debug-scan"></span>
      </div>
      ${this.renderTopRail(live, staticRows)}
      <aside class="ar-debug-col ar-debug-col--left">${left}</aside>
      <aside class="ar-debug-col ar-debug-col--right">${right}</aside>
      ${this.renderEventsTicker()}
    </div>`;
  }
}

export function wireDebugToggle(
  toggle: HTMLButtonElement,
  panel: HTMLElement,
  collector: DebugCollector,
): () => void {
  const onToggle = () => {
    const next = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(next));
    panel.hidden = !next;
    collector.setEnabled(next);
  };

  toggle.addEventListener("click", onToggle);
  return () => toggle.removeEventListener("click", onToggle);
}

export function resetDebugOverlay(toggle: HTMLButtonElement, panel: HTMLElement): void {
  toggle.setAttribute("aria-pressed", "false");
  panel.hidden = true;
  panel.innerHTML = "";
}
