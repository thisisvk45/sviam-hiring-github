import { parseArgs } from "node:util";
import { github } from "./lib/github.mjs";
import { auditAccess } from "./lib/provision.mjs";

const { values } = parseArgs({ options: { repo: { type: "string" }, pr: { type: "string" } } });
try {
  if (!/^[\w.-]+\/[\w.-]+$/.test(values.repo || "") || !/^[1-9]\d*$/.test(values.pr || "")) throw new Error("Provide --repo OWNER/REPO --pr NUMBER.");
  const [owner, name] = values.repo.split("/");
  if (!name.startsWith("assignment-")) throw new Error("Expected an assigned repository.");
  const id = name.slice("assignment-".length);
  const marker = JSON.parse(Buffer.from(github("GET", `repos/${owner}/sviam-hiring-github/contents/assignments/${id}.json?ref=main`).content, "base64").toString());
  const metadata = auditAccess(github, values.repo, [owner, marker.github_login]);
  if (metadata.id !== marker.repository_id || marker.repository !== values.repo) throw new Error("Repository identity differs from the trusted staff record.");
  const pr = github("GET", `repos/${values.repo}/pulls/${values.pr}`);
  if (pr.user.id !== marker.github_user_id || pr.head.repo?.full_name !== values.repo || pr.base.repo.full_name !== values.repo || pr.base.ref !== "main") throw new Error("PR does not match the assigned candidate and repository.");
  if (pr.draft || (pr.state !== "open" && !pr.merged)) throw new Error("A submission must be a non-draft open PR, or an already-merged reviewed PR.");
  console.log(JSON.stringify({ candidate_id: marker.candidate_id, repository: values.repo, pr_url: pr.html_url, head_commit: pr.head.sha, merged: pr.merged, inspected_at: new Date().toISOString(), deadline: marker.deadline, note: "Read-only receipt of the current PR revision. Save it outside the candidate repository. This does not determine deadline compliance or preserve the code by itself." }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
