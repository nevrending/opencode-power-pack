/**
 * opencode-power-pack
 *
 * Registers every bundled skill and the feature workflow's specialist roles
 * with OpenCode 2 through the V2 plugin API, so the pack works without
 * symlinks, config edits, or a separate install step.
 *
 * The V2 plugin exposes skills to the model and the slash catalog, and the
 * specialist roles are read-only subagents derived from their SKILL.md bodies.
 * User-defined agents with the same names are preserved.
 *
 * ──── Attribution ────────────────────────────────────────────────────────
 *
 * The V1 plugin this file ports registered the skill directory through the
 * OpenCode 1 `config` hook. That loader pattern was adapted from Jesse
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
import { loadAgentConfigs, loadSkillConfigs } from '../lib/agent-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '../../skills');
const bundledSkills = loadSkillConfigs(skillsDir);
const bundledAgents = loadAgentConfigs(skillsDir);

export default Plugin.define({
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
