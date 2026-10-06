import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerRolePack } from "./roles.ts";

export default function piHerdrPstack(pi: ExtensionAPI) {
	registerRolePack(pi);
}
