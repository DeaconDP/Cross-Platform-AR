import { registerPlugin } from "@capacitor/core";
const CubeAR = registerPlugin("CubeAR", {
    web: () => import("./web").then((m) => new m.CubeARWeb()),
});
export * from "./definitions";
export { CubeAR };
