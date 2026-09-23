import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import plugin from "../.opencode/plugins/opencode-power-pack.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(REPO, "skills");
const SKILL_NAMES = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function fakeEditor(entries = new Map()) {
  return {
    entries,
    list: () => [...entries.values()],
    get: (id) => entries.get(id),
    add: (entry) => entries.set(entry.id, entry),
    update: (id, update) => {
      const draft = entries.get(id) ?? { id };
      update(draft);
      entries.set(id, draft);
    },
    remove: (id) => entries.delete(id),
  };
}

async function register() {
  const skills = fakeEditor();
  const agents = fakeEditor();
  const context = {
    skill: { transform: async (callback) => callback(skills) },
    agent: { transform: async (callback) => callback(agents) },
  };
  await plugin.setup(context);
  return { skills, agents };
}

test("plugin registers every bundled skill with the V2 Skill.Info shape", async () => {
  const { skills } = await register();

  assert.equal(plugin.id, "opencode-power-pack");
  assert.equal(skills.list().length, SKILL_NAMES.length);

  for (const name of SKILL_NAMES) {
    const skill = skills.get(name);
    assert.ok(skill, `${name} is registered`);
    assert.equal(skill.id, name);
    assert.match(skill.name, /\S/);
    assert.match(skill.description, /\S/);
    assert.equal(skill.path, path.join(SKILLS_DIR, name, "SKILL.md"));
    assert.match(skill.content, /\S/);
    assert.doesNotMatch(skill.content, /^---/, `${name} registers its body without frontmatter`);
  }

  assert.match(
    skills.get("feature-dev").content,
    /# Feature Development/,
    "skill content keeps the workflow body",
  );
});

test("plugin registers the feature workflow roles as read-only subagents", async () => {
  const { agents } = await register();

  for (const name of ["code-explorer", "code-architect", "code-reviewer"]) {
    const agent = agents.get(name);
    assert.ok(agent, `${name} is registered`);
    assert.equal(agent.mode, "subagent");
    assert.equal(agent.hidden, false);
    assert.match(agent.description, /\S/);
    assert.match(agent.system, /\S/);
    assert.doesNotMatch(agent.system, /^---/);

    const rule = (action, resource) => agent.permissions
      .filter((entry) => entry.action === action && entry.resource === resource)
      .at(-1)?.effect;
    assert.equal(rule("*", "*"), "deny", `${name} denies unlisted actions`);
    assert.equal(rule("read", "*"), "allow");
    assert.equal(rule("read", "*.env"), "deny");
    assert.equal(rule("read", "*.env.*"), "deny");
    assert.equal(rule("read", "*.env.example"), "allow");
    assert.equal(rule("glob", "*"), "allow");
    assert.equal(rule("grep", "*"), "allow");
    assert.equal(rule("edit", "*"), "deny");
    assert.equal(rule("subagent", "*"), "deny");
    assert.equal(rule("webfetch", "*"), "deny");
    assert.equal(rule("websearch", "*"), "deny");
    assert.equal(rule("external_directory", "*"), "deny");
    assert.equal(rule("shell", "*"), "deny");
  }

  assert.match(
    agents.get("code-reviewer").system,
    /Dispatched handoff/i,
    "registered reviewer inherits the handoff contract",
  );

  const reviewer = agents.get("code-reviewer").permissions;
  assert.deepEqual(
    reviewer.filter(({ action }) => action === "shell"),
    [
      { action: "shell", resource: "*", effect: "deny" },
      { action: "shell", resource: "git status*", effect: "allow" },
      { action: "shell", resource: "git diff*", effect: "allow" },
      { action: "shell", resource: "git show*", effect: "allow" },
      { action: "shell", resource: "git log*", effect: "allow" },
      { action: "shell", resource: "git blame*", effect: "allow" },
      { action: "shell", resource: "git rev-parse*", effect: "allow" },
      { action: "shell", resource: "git merge-base*", effect: "allow" },
      { action: "shell", resource: "git ls-files*", effect: "allow" },
      { action: "shell", resource: "git *--output*", effect: "deny" },
      { action: "shell", resource: "git *--ext-diff*", effect: "deny" },
      { action: "shell", resource: "git *>*", effect: "deny" },
    ],
    "code-reviewer keeps the read-only Git allowlist and write-through denials",
  );
});

test("plugin preserves agents registered before it", async () => {
  const customReviewer = { id: "code-reviewer", name: "Custom", mode: "subagent" };
  const skills = fakeEditor();
  const agents = fakeEditor(new Map([["code-reviewer", customReviewer]]));

  await plugin.setup({
    skill: { transform: async (callback) => callback(skills) },
    agent: { transform: async (callback) => callback(agents) },
  });

  assert.equal(agents.get("code-reviewer"), customReviewer);
  assert.ok(agents.get("code-explorer"), "other roles are still registered");
  assert.ok(agents.get("code-architect"), "other roles are still registered");
});
