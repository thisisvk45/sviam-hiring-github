import test from "node:test";
import assert from "node:assert/strict";
import { auditAccess, provision, validate } from "../lib/provision.mjs";

const options = { owner: "owner", candidate: "candidate", id: "candidate-001", template: "owner/template" };
test("invalid identifiers cannot become API paths", () => {
  assert.throws(() => validate({ ...options, candidate: "../other" }));
  assert.throws(() => validate({ ...options, id: "../../other" }));
  assert.throws(() => validate({ ...options, candidate: "owner" }));
});
test("public repos and forks are rejected before inviting a candidate", () => {
  for (const repo of [{ private: false, visibility: "public" }, { private: true, visibility: "private", fork: true }]) assert.throws(() => auditAccess(() => repo, "owner/repo", ["owner", "candidate"]));
});
test("unexpected access is detected on subsequent collaborator pages", () => {
  const api = (_method, path) => {
    if (path === "repos/owner/repo") return { private: true, visibility: "private", fork: false, owner: { login: "owner" } };
    if (path.includes("collaborators") && path.endsWith("page=1")) return Array.from({ length: 100 }, () => ({ login: "owner" }));
    if (path.includes("collaborators")) return [{ login: "another-candidate" }];
    return [];
  };
  assert.throws(() => auditAccess(api, "owner/repo", ["owner", "candidate"]), /Unexpected repository access/);
});
test("an admin candidate or unexpected invitation is rejected", () => {
  for (const mode of ["admin", "invitation"]) {
    const api = (_method, path) => {
      if (path === "repos/owner/repo") return { private: true, visibility: "private", fork: false, owner: { login: "owner" } };
      if (path.includes("collaborators")) return mode === "admin" ? [{ login: "candidate", permissions: { admin: true } }] : [];
      return [{ invitee: { login: "other" }, permissions: "write" }];
    };
    assert.throws(() => auditAccess(api, "owner/repo", ["owner", "candidate"]));
  }
});
test("a name collision cannot transfer an existing assignment to another person", () => {
  const writes = [];
  const api = (method, path) => {
    if (method !== "GET") { writes.push(path); return {}; }
    if (path === "users/candidate") return { id: 222, login: "candidate", type: "User" };
    if (path === "repos/owner/template") return { private: true, visibility: "private", fork: false, is_template: true, owner: { login: "owner" } };
    if (path === "user") return { login: "owner" };
    if (path.includes("contents/assignments/")) return { content: Buffer.from(JSON.stringify({ candidate_id: options.id, github_user_id: 111, template: options.template })).toString("base64") };
    if (path.includes("collaborators") || path.includes("invitations")) return [];
    return { private: true, visibility: "private", fork: false, owner: { login: "owner" } };
  };
  assert.throws(() => provision(api, options), /different assignment/);
  assert.deepEqual(writes, []);
});

function successfulApi({ failRegistryWrite = false, wrongTree = false } = {}) {
  const writes = [];
  let created = false;
  let record;
  let invitation;
  const metadata = { id: 345, private: true, visibility: "private", fork: false, owner: { login: "owner" } };
  const missing = () => { throw Object.assign(new Error("Not found"), { status: "404" }); };
  const api = (method, path, body) => {
    if (method === "GET") {
      if (path === "users/candidate") return { id: 222, login: "candidate", type: "User" };
      if (path === "user") return { login: "owner" };
      if (path === "repos/owner/template") return { ...metadata, is_template: true, default_branch: "main" };
      if (path === "repos/owner/sviam-hiring-github") return metadata;
      if (path.includes("contents/assignments/")) return record ? { content: record } : missing();
      if (path === "repos/owner/assignment-candidate-001") return created ? metadata : missing();
      if (path.includes("/commits/")) return { sha: path.includes("template") ? "template-sha" : "starter-sha", commit: { tree: { sha: wrongTree && !path.includes("template") ? "wrong-tree" : "same-tree" } } };
      if (path.includes("/collaborators")) return [{ id: 111, login: "owner", permissions: { admin: true } }];
      if (path.includes("/invitations")) return path.includes("assignment-candidate-001") && invitation ? [invitation] : [];
    } else {
      writes.push({ method, path, body });
      if (path.endsWith("/generate")) { created = true; return metadata; }
      if (path.includes("contents/assignments/")) {
        if (failRegistryWrite) throw new Error("Registry write failed");
        record = body.content;
        return {};
      }
      if (path.endsWith("/collaborators/candidate")) {
        assert.ok(record, "trusted record must exist before inviting");
        invitation = { invitee: { id: 222, login: "candidate" }, permissions: "write" };
        return invitation;
      }
      return {};
    }
    throw new Error(`Unexpected API request ${method} ${path}`);
  };
  return { api, writes, record: () => record };
}

test("provisioning creates a private copy, records its baseline, disables Actions, and invites once", () => {
  const fake = successfulApi();
  const result = provision(fake.api, options);
  assert.equal(result.access, "invitation pending");
  assert.equal(result.private, true);
  const generation = fake.writes.find(write => write.path.endsWith("/generate"));
  assert.deepEqual(generation.body, { owner: "owner", name: "assignment-candidate-001", private: true, include_all_branches: false, description: "Private SViam take-home. Submit a PR in this repository." });
  const record = JSON.parse(Buffer.from(fake.record(), "base64").toString());
  assert.equal(record.github_user_id, 222);
  assert.equal(record.repository_id, 345);
  assert.equal(record.template_commit, "template-sha");
  const disabled = fake.writes.findIndex(write => write.path.endsWith("/actions/permissions") && write.body.enabled === false);
  const invite = fake.writes.findIndex(write => write.path.endsWith("/collaborators/candidate"));
  assert.ok(disabled >= 0 && disabled < invite);
  assert.deepEqual(fake.writes[invite].body, { permission: "push" });
  assert.deepEqual(provision(fake.api, options), result);
  assert.equal(fake.writes.filter(write => write.path.endsWith("/generate")).length, 1);
  assert.equal(fake.writes.filter(write => write.path.endsWith("/collaborators/candidate")).length, 1);
});

test("a failed registry write or changed template never sends a candidate invitation", () => {
  for (const failure of [{ failRegistryWrite: true }, { wrongTree: true }]) {
    const fake = successfulApi(failure);
    assert.throws(() => provision(fake.api, options), /Registry write failed|Template changed/);
    assert.equal(fake.writes.some(write => write.path.endsWith("/collaborators/candidate")), false);
  }
});
