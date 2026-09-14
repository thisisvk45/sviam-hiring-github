import { allPages } from "./github.mjs";

export function validate(options) {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(options.owner || "")) throw new Error("Invalid owner.");
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(options.candidate || "")) throw new Error("Invalid candidate GitHub username.");
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(options.id || "")) throw new Error("Use an opaque candidate ID of 3–40 lowercase letters, digits, or hyphens.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.template || "")) throw new Error("Invalid template owner/repository.");
  if (options.candidate.toLowerCase() === options.owner.toLowerCase()) throw new Error("Candidate must differ from repository owner.");
  if (options.deadline && (!Number.isFinite(Date.parse(options.deadline)) || !/Z$/.test(options.deadline))) throw new Error("Deadline must be an ISO UTC timestamp ending in Z.");
  return { ...options, repo: `${options.owner}/assignment-${options.id}` };
}

export function auditAccess(api, repo, expectedLogins, { allowPublicTemplate = false } = {}) {
  const metadata = api("GET", `repos/${repo}`);
  const validVisibility = (metadata.private && metadata.visibility === "private") ||
    (allowPublicTemplate && metadata.is_template && !metadata.private && metadata.visibility === "public");
  if (!validVisibility || metadata.fork) throw new Error("Repository must be independent and private, except for an explicitly allowed public starter template.");
  const allowed = new Set(expectedLogins.map(login => login.toLowerCase()));
  for (const collaborator of allPages(api, `repos/${repo}/collaborators`)) {
    if (!allowed.has(collaborator.login.toLowerCase())) throw new Error(`Unexpected repository access: ${collaborator.login}. Review permissions before proceeding.`);
    if (collaborator.login.toLowerCase() !== metadata.owner.login.toLowerCase() && (collaborator.permissions?.admin || collaborator.permissions?.maintain)) throw new Error(`Excessive candidate permission: ${collaborator.login}`);
  }
  for (const invitation of allPages(api, `repos/${repo}/invitations`)) {
    if (!invitation.invitee?.login || !allowed.has(invitation.invitee.login.toLowerCase()) || invitation.permissions !== "write") throw new Error("Unexpected repository invitation or excessive permission.");
  }
  return metadata;
}

export function provision(api, rawOptions) {
  const options = validate(rawOptions);
  const { owner, candidate, id, template, repo, deadline = null } = options;
  const account = api("GET", `users/${candidate}`);
  if (account.type !== "User") throw new Error("Candidate must be a GitHub user account.");
  const source = api("GET", `repos/${template}`);
  if (!source.is_template) throw new Error("Use the staff-controlled starter template.");
  if (source.owner.login.toLowerCase() !== owner.toLowerCase()) throw new Error("Template must belong to the selected owner.");
  auditAccess(api, template, [owner], { allowPublicTemplate: true });
  const actor = api("GET", "user");
  if (actor.login.toLowerCase() !== owner.toLowerCase()) throw new Error("This pilot provisioner requires the personal repository owner to run gh. Organization/App support is a later integration.");
  const registry = `${owner}/sviam-hiring-github`;
  const registryRepo = api("GET", `repos/${registry}`);
  if (!registryRepo.private || registryRepo.owner.login.toLowerCase() !== owner.toLowerCase()) throw new Error("The staff registry must be private and owned by the selected account.");
  auditAccess(api, registry, [owner]);
  const recordPath = `repos/${registry}/contents/assignments/${id}.json`;
  let record;
  try { record = JSON.parse(Buffer.from(api("GET", `${recordPath}?ref=main`).content, "base64").toString()); }
  catch (error) { if (error.status !== "404") throw error; }

  let existing;
  try { existing = api("GET", `repos/${repo}`); }
  catch (error) { if (error.status !== "404") throw error; }
  if (existing) {
    auditAccess(api, repo, [owner, candidate]);
    if (!record) throw new Error("Existing repository lacks a trusted staff record. Stop and inspect it; do not reuse it for another person.");
    if (record.candidate_id !== id || record.github_user_id !== account.id || record.template !== template || record.repository_id !== existing.id) throw new Error("Existing repository belongs to a different assignment or candidate.");
  } else {
    if (record) throw new Error("A staff record already exists for this ID. Inspect the missing repository instead of provisioning another one.");
    const templateCommit = api("GET", `repos/${template}/commits/${source.default_branch}`);
    api("POST", `repos/${template}/generate`, { owner, name: `assignment-${id}`, private: true, include_all_branches: false, description: "Private SViam take-home. Submit a PR in this repository." });
    // Do not invite anyone until visibility and baseline contents are verified.
    const created = auditAccess(api, repo, [owner]);
    const baseline = api("GET", `repos/${repo}/commits/main`);
    if (baseline.commit.tree.sha !== templateCommit.commit.tree.sha) throw new Error("Template changed during provisioning. No candidate was invited. Inspect this private repository before retrying.");
    const marker = { schema_version: 1, candidate_id: id, github_user_id: account.id, github_login: account.login, repository_id: created.id, repository: repo, template, template_commit: templateCommit.sha, starter_commit: baseline.sha, deadline, submission: "Open a non-draft PR from your solution branch to main in this repository." };
    api("PUT", `repos/${repo}/contents/.assignment.json`, { message: "Record private assignment identity and starter revision", content: Buffer.from(JSON.stringify(marker, null, 2) + "\n").toString("base64"), branch: "main" });
    api("PUT", recordPath, { message: `Register private assignment ${id}`, content: Buffer.from(JSON.stringify(marker, null, 2) + "\n").toString("base64"), branch: "main" });
  }
  api("PATCH", `repos/${repo}`, { has_wiki: false, has_discussions: false, allow_auto_merge: false, delete_branch_on_merge: false });
  // Candidate code has no access to shared CI secrets or paid runner minutes.
  api("PUT", `repos/${repo}/actions/permissions`, { enabled: false });
  auditAccess(api, repo, [owner, candidate]);
  const collaborators = allPages(api, `repos/${repo}/collaborators`);
  const invitations = allPages(api, `repos/${repo}/invitations`);
  const hasAccess = collaborators.some(person => person.id === account.id);
  const invited = invitations.some(invitation => invitation.invitee?.id === account.id);
  if (!hasAccess && !invited) api("PUT", `repos/${repo}/collaborators/${candidate}`, { permission: "push" });
  auditAccess(api, repo, [owner, candidate]);
  return { repository: `https://github.com/${repo}`, candidate: account.login, access: hasAccess ? "accepted" : "invitation pending", private: true };
}
