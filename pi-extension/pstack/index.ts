import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPotetoMode } from "./mode.ts";
import { registerRolePack } from "./roles.ts";
import { registerSetup } from "./setup.ts";

export default function piHerdrPstack(pi: ExtensionAPI) {
	registerRolePack(pi);
	registerPotetoMode(pi);
	registerSetup(pi);
}
