import { parseArgs } from "node:util";
import { github } from "./lib/github.mjs";
import { provision, validate } from "./lib/provision.mjs";

const { values } = parseArgs({ options: { owner: { type: "string", default: "thisisvk45" }, template: { type: "string", default: "thisisvk45/sviam-livekit-editor-assignment" }, candidate: { type: "string" }, id: { type: "string" }, deadline: { type: "string" }, apply: { type: "boolean", default: false } } });
try {
  const options = validate(values);
  if (!values.apply) console.log(JSON.stringify({ mode: "preview; no writes or invitations", ...options }, null, 2));
  else console.log(JSON.stringify(provision(github, options), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
