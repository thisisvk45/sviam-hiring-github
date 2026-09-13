# SViam · Private GitHub assignment operations

Staff-only tooling for **one independent private repository per candidate**.
The starter is [sviam-livekit-editor-assignment](https://github.com/thisisvk45/sviam-livekit-editor-assignment).

## Visibility contract

GitHub has repository-level access, not author-only PR visibility. A candidate
can see every PR inside their own assigned repository. They receive no access
to another candidate's repository. The owner (`thisisvk45`) can see and review all
submissions. A reviewer with repository access can also see its PRs. A candidate
does not need to merge a PR to submit. Private access cannot prevent an authorized
candidate from copying their own checkout elsewhere.

Do not collect candidates into one repository, grant access to this operations
repository, or grant access to the master template. Generate independent copies.
This account-based pilot gives access only to the owner and assigned candidate.
If additional reviewers are needed, implement an explicit reviewed allowlist and
prefer an organization for granular reviewer permissions.

## Provision after Maya

Prerequisites: Node.js 20+, GitHub CLI, `gh auth login` as `thisisvk45`, and the
candidate's verified GitHub account. Provisioning sends a GitHub repository
invitation; it does not send a recruiting email or allocate provider credits.

Preview without writes:

```sh
node provision.mjs --candidate THEIR_GITHUB_USERNAME --id OPAQUE_CANDIDATE_ID
```

After verifying the account, create the repository and invitation:

```sh
node provision.mjs --candidate THEIR_GITHUB_USERNAME --id OPAQUE_CANDIDATE_ID --deadline 2026-10-01T23:59:59Z --apply
```

The deadline above is an example, not the assignment's default. Use a lowercase
opaque ID of 3–40 characters. The script validates the owner, template, candidate,
private visibility, baseline tree, existing collaborators, and pending invitations
before granting access. It records the candidate's numeric GitHub user ID,
repository ID, and starter revision in this staff-only repository under
`assignments/ID.json`. A copy in the candidate's `.assignment.json` is for reference
only; candidate-editable metadata is never the trusted identity registry.
Re-running for the same candidate reuses
their repository/invitation; a conflicting candidate identity stops the operation.

Partial failures stop without inviting a candidate until the baseline is verified.
Inspect a partially created repository manually; do not delete or reuse it for a
different candidate to force a retry through. Existing extra collaborators cause
an error rather than being silently removed. GitHub may take time to materialize
a generated repository; retry after inspecting a failure.

Candidate Actions are disabled by default: work and tests run locally, as requested.
The master starter's CI checks the baseline. Do not place shared API keys or
administration credentials in candidate repositories or their Actions secrets.

## Submission lives on GitHub

The candidate accepts their invitation, clones the repo, works on `solution`, and
opens a PR to `main` **in their own repo**. A draft is work in progress. An open,
non-draft PR is submission; no portal upload or self-merge is required. Review via
GitHub comments. Record the specific commit before testing or making a decision.

Read the current submission and validate its author/repository:

```sh
node submission.mjs --repo thisisvk45/assignment-OPAQUE_ID --pr 1
```

The receipt does not freeze code or enforce a deadline by itself. Save a trusted
copy outside the candidate repo. For the pilot, the owner records the final SHA
and preserves an archive before changing candidate access or archiving a repo.
Treat all candidate code and candidate CI output as untrusted; run review tests in
an isolated environment without production credentials.

## Branch protection and plan limits

Repository privacy does not require paid branch protection. Personal private repos
need GitHub Pro (or a supported higher plan) for protected branches. This pilot
does not claim main is technically protected on an unverified plan. The candidate
instructions require keeping main unchanged; reviewers have the trusted starter
baseline in the master and should compare against it if main was changed.

For an organization, use candidates as outside collaborators, base permissions
None, and explicit reviewer access. Private branch protection needs Team or
Enterprise, and private-repo outside collaborators count as paid seats on paid
organization plans. This script intentionally requires the selected personal
owner; it does not silently configure organization-wide access.

## Rollout order

1. Publish and verify the private starter and these operations tools.
2. Update the hiring flow to use GitHub PRs as submissions. Existing Python
   assignment invitations stay tied to their original version.
3. Configure funded provider access and test real voice end to end.
4. Automate assignment provisioning and the email after the mandatory Maya round.

The later portal integration should bind a verified numeric GitHub account to the
application, provision once per assignment, and record signed, deduplicated PR
events. Subscribe to `pull_request` opened, ready_for_review, synchronize, and
closed events. Check repository ID, author ID, base/head, draft state, and the
submitted SHA. Use a trusted external receiver or staff-controlled workflow, not
a candidate-editable workflow as the authority. Email retries must not provision
additional repositories or credits.

No webhook, email automation, credit issuance, or candidate invitation is enabled
merely by publishing this repository.

## Verification

```sh
npm test
```

Tests cover visibility, fork isolation, pagination, excessive permissions,
unexpected invitations, prevention of candidate identity reassignment, successful
provisioning order, duplicate retries, and failure before invitation. These are
tests against simulated GitHub API responses. A real candidate invitation and
cross-account acceptance check still need a verified candidate account.

Sources: [repository roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization),
[template API](https://docs.github.com/en/rest/repos/repos#create-a-repository-using-a-template),
[collaborator API](https://docs.github.com/en/rest/collaborators/collaborators#add-a-repository-collaborator),
[branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches).
