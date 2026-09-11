/** Form-factor steward — Mac/Chromebook/desktop-site still places, never blocks. */

export type ArFormKind = "ok" | "site" | "host";
export type ArFormProduct = "place" | "scan" | "emily" | "cubes";

export const AR_FORM_HOLD_MS = 400;
export const AR_FORM_RELEASE_MS = 800;

export type ArFormHold = {
  kind: ArFormKind;
  raw: ArFormKind;
  since: number;
};

export type ArFormState = {
  kind: ArFormKind;
  hostOn: boolean;
  siteOn: boolean;
  valid: boolean;
};

export type ArFormSignals = {
  iosOnMac?: boolean;
  pcWithoutPhone?: boolean;
  chromebook?: boolean;
  desktopUa: boolean;
  mobileUa: boolean;
  touch: boolean;
  mobileHint?: boolean | null;
};

export function arFormKindFromFlags(flags: {
  hostOn: boolean;
  siteOn: boolean;
}): ArFormKind {
  if (flags.hostOn) return "host";
  if (flags.siteOn) return "site";
  return "ok";
}

/** Native + web signals → host (computer) > site (desktop UA on a handheld) > ok. */
export function arFormKindFromSignals(s: ArFormSignals): ArFormKind {
  if (s.iosOnMac || s.pcWithoutPhone || s.chromebook) return "host";
  if (s.mobileHint === false && !s.touch) return "host";
  if (s.desktopUa && !s.touch && !s.mobileUa) return "host";
  if (s.desktopUa && s.touch) return "site";
  return "ok";
}

export function arFormDesktopUa(ua: string): boolean {
  const u = ua.toLowerCase();
  const desk =
    u.includes("macintosh") ||
    u.includes("windows nt") ||
    u.includes("x11") ||
    u.includes("cros");
  const mobile =
    u.includes("mobile") || u.includes("android") || u.includes("iphone");
  return desk && !mobile;
}

export function arFormMobileUa(ua: string): boolean {
  const u = ua.toLowerCase();
  return (
    u.includes("mobile") ||
    u.includes("android") ||
    u.includes("iphone") ||
    u.includes("ipod")
  );
}

/** Web: Request Desktop Website vs a real computer. Node is invalid. */
export function arFormReadWeb(): {
  hostOn: boolean;
  siteOn: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { hostOn: false, siteOn: false, valid: false };
  }
  const ua = navigator.userAgent ?? "";
  const uaData = (
    navigator as { userAgentData?: { mobile?: boolean; platform?: string } }
  ).userAgentData;
  const touch =
    (navigator.maxTouchPoints ?? 0) > 0 || "ontouchstart" in window;
  const chromebook =
    /CrOS/i.test(ua) || /Chromebook/i.test(uaData?.platform ?? "");
  const kind = arFormKindFromSignals({
    desktopUa: arFormDesktopUa(ua),
    mobileUa: arFormMobileUa(ua),
    touch,
    mobileHint: typeof uaData?.mobile === "boolean" ? uaData.mobile : null,
    chromebook,
  });
  return {
    hostOn: kind === "host",
    siteOn: kind === "site",
    valid: true,
  };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arFormStep(
  prev: ArFormHold | null,
  raw: ArFormKind,
  now: number,
): ArFormHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_FORM_RELEASE_MS : AR_FORM_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arFormCoach(
  kind: ArFormKind,
  product: ArFormProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "host") {
    if (product === "scan") {
      return "This computer camera can’t lock a plaque — use a phone.";
    }
    if (product === "emily") {
      return "This computer camera can’t lock a table — use a phone to place me.";
    }
    if (product === "cubes") {
      return "This computer camera can’t lock a table — use a phone to place a cube.";
    }
    return "This computer camera can’t lock a table — use a phone to place the fossil.";
  }
  if (product === "scan") {
    return "Turn off Request Desktop Website so taps land on the plaque.";
  }
  if (product === "emily") {
    return "Turn off Request Desktop Website so taps land on me.";
  }
  if (product === "cubes") {
    return "Turn off Request Desktop Website so taps land on a cube.";
  }
  return "Turn off Request Desktop Website so taps land on the fossil.";
}

/** A desktop site or Mac window never remaps taps. Scan still hunts. */
export function arFormBlocksPlace(
  _kind: ArFormKind,
  _product: ArFormProduct,
): boolean {
  return false;
}

/** Hosts can prefer the phone path when the form factor is wrong. */
export function arFormPrefersPhone(kind: ArFormKind): boolean {
  return kind === "host" || kind === "site";
}

export function arFormApplyClass(el: Element | null, kind: ArFormKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-form-host", kind === "host");
  el.classList.toggle("is-ar-form-site", kind === "site");
}

export function arFormParseNative(data: {
  kind?: string;
  hostOn?: boolean;
  siteOn?: boolean;
  valid?: boolean;
}): ArFormState {
  const hostOn = data.hostOn === true;
  const siteOn = data.siteOn === true;
  const kind: ArFormKind =
    data.kind === "host" || data.kind === "site" || data.kind === "ok"
      ? data.kind
      : arFormKindFromFlags({ hostOn, siteOn });
  return {
    kind,
    hostOn,
    siteOn,
    valid: data.valid === true,
  };
}

export type ArFormArm = { dispose: () => void };

export function arFormArm(opts: {
  product: ArFormProduct;
  getNative?: () => Promise<ArFormState | null>;
  onKind: (kind: ArFormKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArFormArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArFormHold | null = null;
  let alive = true;
  const apply = (raw: ArFormKind) => {
    hold = arFormStep(hold, raw, nowFn());
    arFormApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arFormCoach(hold.kind, opts.product));
  };
  const tick = async () => {
    if (!alive) return;
    if (opts.getNative) {
      try {
        const native = await opts.getNative();
        if (!alive) return;
        if (native?.valid) {
          apply(native.kind);
          return;
        }
      } catch {
        /* fall through to web */
      }
    }
    const web = arFormReadWeb();
    apply(web.valid ? arFormKindFromFlags(web) : (hold?.raw ?? "ok"));
  };
  const id =
    typeof window !== "undefined"
      ? window.setInterval(() => {
          void tick();
        }, opts.intervalMs ?? 800)
      : 0;
  void tick();
  return {
    dispose() {
      alive = false;
      if (typeof window !== "undefined") window.clearInterval(id);
      arFormApplyClass(opts.root ?? null, "ok");
    },
  };
}
