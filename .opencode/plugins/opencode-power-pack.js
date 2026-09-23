/**
 * opencode-power-pack
 *
 * Registers every bundled skill and the feature workflow's specialist roles
 * with OpenCode 1 and OpenCode 2 from one entrypoint:
 *
 * - OpenCode 2 calls `setup` and uses the V2 skill and agent transforms, so
 *   the pack works without symlinks, config edits, or a separate install step.
 * - OpenCode 1 calls `server` and receives the original config hook, which
 *   adds the bundled skills directory to `config.skills.paths` and merges the
 *   specialist agents into `config.agent`.
 *
 * User-defined agents with the same names are preserved on both hosts.
 *
 * ──── Attribution ────────────────────────────────────────────────────────
 *
 * The V1 skill-path registration pattern was adapted directly from Jesse
 * Vincent's superpowers plugin: https://github.com/obra/superpowers
 *
 * The skills under skills/ are modified upstream works. See UPSTREAMS.json
 * for immutable source commits and blobs, and THIRD_PARTY_NOTICES.md for
 * their licenses and attribution.
 * ─────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { Plugin } from '@opencode/plugin';
import { loadAgentConfigs, loadLegacyAgentConfigs, loadSkillConfigs } from '../lib/agent-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '../../skills');
const bundledSkills = loadSkillConfigs(skillsDir);
const bundledAgents = loadAgentConfigs(skillsDir);
const legacyAgents = loadLegacyAgentConfigs(skillsDir);

/**
 * The OpenCode 1 config hook. It is shared by the default export's `server`
 * hook and the legacy named export below.
 */
async function configure(config) {
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];
  if (!config.skills.paths.includes(skillsDir)) {
    config.skills.paths.push(skillsDir);
  }

  config.agent = config.agent || {};
  for (const [name, agent] of Object.entries(legacyAgents)) {
    if (!config.agent[name]) config.agent[name] = agent;
  }
}

const definition = Plugin.define({
  id: 'opencode-power-pack',
  async setup(ctx) {
    await ctx.skill.transform((editor) => {
      for (const skill of bundledSkills) editor.add(skill);
    });

    await ctx.agent.transform((editor) => {
      for (const [name, agent] of Object.entries(bundledAgents)) {
        if (editor.get(name)) continue;
        editor.update(name, (draft) => Object.assign(draft, agent));
      }
    });
  },
});

/**
 * Legacy entrypoint name for OpenCode 1 releases that only discover named
 * exports. OpenCode 1.18.7 and newer also honor `server` on the default
 * export, so the hook body is shared.
 */
export const OpencodePowerPack = async () => ({ config: configure });

export default {
  ...definition,
  async server() {
    return { config: configure };
  },
};
