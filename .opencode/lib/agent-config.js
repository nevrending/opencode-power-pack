import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const AGENT_NAMES = ["code-explorer", "code-architect", "code-reviewer"];

/**
 * OpenCode V2 permissions are an ordered ruleset where the last matching rule
 * wins. The V1 map below became this array, keeping the catch-all deny first
 * and the narrow exceptions after it.
 *
 * V1 keys without a V2 action:
 * - "list" is covered by the V2 read tool.
 * - "task" is the V2 subagent action.
 */
const READ_ONLY_PERMISSIONS = [
  { action: "*", resource: "*", effect: "deny" },
  { action: "read", resource: "*", effect: "allow" },
  { action: "read", resource: "*.env", effect: "deny" },
  { action: "read", resource: "*.env.*", effect: "deny" },
  { action: "read", resource: "*.env.example", effect: "allow" },
  { action: "glob", resource: "*", effect: "allow" },
  { action: "grep", resource: "*", effect: "allow" },
  { action: "edit", resource: "*", effect: "deny" },
  { action: "subagent", resource: "*", effect: "deny" },
  { action: "webfetch", resource: "*", effect: "deny" },
  { action: "websearch", resource: "*", effect: "deny" },
  { action: "external_directory", resource: "*", effect: "deny" },
  { action: "shell", resource: "*", effect: "deny" },
];

const REVIEW_SHELL_PERMISSIONS = [
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
];

/**
 * OpenCode V1 permissions are a tool-keyed map with the same intent as the V2
 * rulesets above. OpenCode 1 calls `bash` and `task` what OpenCode 2 calls
 * `shell` and `subagent`, and it has a separate `list` tool.
 */
const READ_ONLY_PERMISSION = {
  "*": "deny",
  read: {
    "*": "allow",
    "*.env": "deny",
    "*.env.*": "deny",
    "*.env.example": "allow",
  },
  glob: "allow",
  grep: "allow",
  list: "allow",
  edit: "deny",
  task: "deny",
  webfetch: "deny",
  websearch: "deny",
  external_directory: "deny",
};

const REVIEW_BASH_PERMISSION = {
  "*": "deny",
  "git status*": "allow",
  "git diff*": "allow",
  "git show*": "allow",
  "git log*": "allow",
  "git blame*": "allow",
  "git rev-parse*": "allow",
  "git merge-base*": "allow",
  "git ls-files*": "allow",
  "git *--output*": "deny",
  "git *--ext-diff*": "deny",
  "git *>*": "deny",
};

function readSkill(skillsDir, name) {
  const source = readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid frontmatter in ${name}/SKILL.md`);

  const frontmatter = match[1];
  const description = frontmatter
    .split(/\r?\n/)
    .find((line) => line.startsWith("description:"))
    ?.slice("description:".length)
    .trim();
  if (!description) throw new Error(`Missing description in ${name}/SKILL.md`);

  const displayName = frontmatter
    .split(/\r?\n/)
    .find((line) => line.startsWith("name:"))
    ?.slice("name:".length)
    .trim();

  return { name: displayName || name, description, body: match[2] };
}

function skillNames(skillsDir) {
  return readdirSync(skillsDir)
    .filter((entry) => {
      const directory = path.join(skillsDir, entry);
      return statSync(directory).isDirectory()
        && statSync(path.join(directory, "SKILL.md"), { throwIfNoEntry: false })?.isFile() === true;
    })
    .sort();
}

/**
 * Builds OpenCode V2 Skill.Info entries from every bundled SKILL.md.
 * Native discovery strips frontmatter, so the registered content is the
 * Markdown body and the frontmatter supplies the display name and description.
 */
export function loadSkillConfigs(skillsDir) {
  return skillNames(skillsDir).map((id) => {
    const skill = readSkill(skillsDir, id);
    return {
      id,
      name: skill.name,
      description: skill.description,
      path: path.join(skillsDir, id, "SKILL.md"),
      content: skill.body,
    };
  });
}

/**
 * Builds OpenCode V2 Agent.Info patches for the feature workflow specialists.
 * The caller applies each patch with an agent transform.
 */
export function loadAgentConfigs(skillsDir) {
  return Object.fromEntries(AGENT_NAMES.map((name) => {
    const skill = readSkill(skillsDir, name);
    const permissions = name === "code-reviewer"
      ? [...READ_ONLY_PERMISSIONS.filter(({ action }) => action !== "shell"), ...REVIEW_SHELL_PERMISSIONS]
      : READ_ONLY_PERMISSIONS;

    return [name, {
      name: skill.name,
      description: skill.description,
      system: skill.body.trim(),
      mode: "subagent",
      hidden: false,
      permissions,
    }];
  }));
}

/**
 * Builds OpenCode V1 agent definitions for the same specialists. OpenCode 1
 * merges these through the plugin config hook and keeps its own permission
 * map shape.
 */
export function loadLegacyAgentConfigs(skillsDir) {
  return Object.fromEntries(AGENT_NAMES.map((name) => {
    const skill = readSkill(skillsDir, name);
    const permission = name === "code-reviewer"
      ? { ...READ_ONLY_PERMISSION, bash: REVIEW_BASH_PERMISSION }
      : { ...READ_ONLY_PERMISSION, bash: "deny" };

    return [name, {
      description: skill.description,
      prompt: skill.body.trim(),
      mode: "subagent",
      permission,
    }];
  }));
}
