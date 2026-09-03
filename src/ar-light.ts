/** Dim-room light assist: torch when the LED is free, screen boost on native start. */

export type ArLightProbe = {
  torchAvailable: boolean;
  mediaTorchAvailable: boolean;
};

export function arTorchAvailable(probe: ArLightProbe): boolean {
  return probe.torchAvailable || probe.mediaTorchAvailable;
}

export function arCoachLight(opts: {
  torchAvailable: boolean;
  torchOn: boolean;
  placed?: boolean;
}): string | null {
  if (!opts.torchAvailable) return null;
  if (opts.placed && !opts.torchOn) return null;
  if (opts.torchOn) return "Light on — scan a flat surface.";
  return "Too dark? Tap Light to find a surface faster.";
}

export function arLightLabel(torchOn: boolean): string {
  return torchOn ? "Light on" : "Light";
}

/** Torch intensity 0–1. Dimmer when the OS is already saving power. */
export function arTorchLevel(opts: { saver?: boolean; critical?: boolean }): number {
  if (opts.critical) return 0.25;
  if (opts.saver) return 0.4;
  return 0.7;
}

export function arMediaHasTorch(stream: MediaStream | null | undefined): boolean {
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.getCapabilities) return false;
  return Boolean((track.getCapabilities() as { torch?: boolean }).torch);
}

export async function arApplyMediaTorch(
  stream: MediaStream | null | undefined,
  on: boolean,
): Promise<boolean> {
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return false;
  if (!arMediaHasTorch(stream)) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on }],
    } as unknown as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}
