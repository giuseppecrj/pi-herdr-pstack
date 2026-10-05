import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPotetoMode } from "./mode.ts";
import { registerSetup } from "./setup.ts";

export default function piHerdrPstack(pi: ExtensionAPI) {
	registerPotetoMode(pi);
	registerSetup(pi);
}
