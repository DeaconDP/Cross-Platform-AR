import { registerPlugin } from "@capacitor/core";
import type { CubeARPlugin } from "./definitions";

const CubeAR = registerPlugin<CubeARPlugin>("CubeAR", {
  web: () => import("./web").then((m) => new m.CubeARWeb()),
});

export * from "./definitions";
export { CubeAR };
