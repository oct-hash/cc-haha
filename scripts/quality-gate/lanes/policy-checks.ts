// Policy checks: validate hookify rules, agents, skills, hooks, settings

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseFrontmatter, readJSON, readText } from '../utils/helpers';
import type { DetailItem, LaneExecutionContext, LaneResult } from './types';

const HOOKIFY_PATTERN = /^hookify\.(.+)\.local\.md$/;
const AGENT_PATTERN = /\.md$/;
const SKILL_FILE = 'SKILL.md';

export async function runPolicyChecks(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now();
  const rootDir = ctx.rootDir;
  const allDetails: DetailItem[] = [];

  // --- Hookify Rules ---
  const hookifyResults = validateHookifyRules(join(rootDir, '.claude'));
  allDetails.push(...hookifyResults);

  // --- Agents ---
  const agentResults = validateAgents(join(rootDir, '.claude', 'agents'));
  allDetails.push(...agentResults);

  // --- Skills ---
  const skillResults = validateSkills(join(rootDir, '.claude', 'skills'));
  allDetails.push(...skillResults);

  // --- Hooks ---
  const hookResults = validateHooksConfig(join(rootDir, '.claude', 'hooks'));
  allDetails.push(...hookResults);

  // --- Settings ---
  const settingsResults = validateSettings(join(rootDir, '.claude'));
  allDetails.push(...settingsResults);

  // --- Global Skills (~/.agents/skills/) ---
  const globalSkillResults = validateGlobalSkills(
    join(homedir(), '.agents', 'skills'),
    join(rootDir, '.claude', 'skills'),
  );
  allDetails.push(...globalSkillResults);

  const hasErrors = allDetails.some((d) => d.status === 'error');
  const hasWarns = allDetails.some((d) => d.status === 'warn');

  return {
    id: 'policy-checks',
    title: 'Policy Checks',
    status: hasErrors ? 'failed' : hasWarns ? 'warn' : 'passed',
    durationMs: Date.now() - started,
    category: 'governance',
    description: `Validated hookify rules, agents, skills, hooks, settings`,
    details: allDetails,
  };
}

function validateHookifyRules(claudeDir: string): DetailItem[] {
  const results: DetailItem[] = [];
  let totalRules = 0;

  try {
    const files = readdirSync(claudeDir).filter((f) => HOOKIFY_PATTERN.test(f));
    totalRules = files.length;
    results.push({
      label: `Hookify rules (${totalRules} found)`,
      status: 'ok',
    });

    const names: string[] = [];
    for (const file of files) {
      const filePath = join(claudeDir, file);
      const content = readText(filePath);
      if (!content) {
        results.push({
          label: `${file}: cannot read`,
          status: 'error',
          message: 'File is empty or unreadable',
        });
        continue;
      }

      const { data } = parseFrontmatter(content);
      const errors: string[] = [];

      // Required fields
      if (!data.name) errors.push('missing "name"');
      if (data.enabled === undefined) errors.push('missing "enabled"');
      else if (typeof data.enabled !== 'boolean') errors.push('"enabled" must be boolean');
      if (!data.event) errors.push('missing "event"');
      if (!data.action) errors.push('missing "action"');
      else if (!['warn', 'block', 'info'].includes(String(data.action)))
        errors.push(`invalid action: ${data.action}`);

      // Validate regex pattern if present
      if (data.pattern && typeof data.pattern === 'string') {
        try {
          new RegExp(data.pattern);
        } catch {
          // Pattern may use PCRE/Python syntax (e.g. (?i) inline flags)
          // that JavaScript doesn't support — warn but don't block
          results.push({
            label: `${file}: pattern uses non-JS regex syntax`,
            status: 'warn',
            message: (data.pattern as string).slice(0, 80),
          });
        }
      }

      if (errors.length > 0) {
        results.push({
          label: `${file}`,
          status: 'error',
          message: errors.join('; '),
        });
      }

      if (typeof data.name === 'string') names.push(data.name);
    }

    // Check for duplicate names
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      results.push({
        label: 'Duplicate hookify names',
        status: 'error',
        message: duplicates.join(', '),
      });
    }
  } catch (err) {
    results.push({
      label: 'Hookify rules',
      status: 'warn',
      message: `Could not scan .claude directory: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

function validateAgents(agentsDir: string): DetailItem[] {
  const results: DetailItem[] = [];

  if (!existsSync(agentsDir)) {
    results.push({ label: 'Agents directory', status: 'warn', message: 'Not found' });
    return results;
  }

  try {
    const files = readdirSync(agentsDir)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => f !== 'README.md');

    results.push({
      label: `Agents (${files.length} found)`,
      status: 'ok',
    });

    for (const file of files) {
      const filePath = join(agentsDir, file);
      const content = readText(filePath);
      if (!content) {
        results.push({ label: `${file}: empty`, status: 'error' });
        continue;
      }

      const { data } = parseFrontmatter(content);
      const errors: string[] = [];

      if (!data.name) errors.push('missing "name"');
      if (!data.description) errors.push('missing "description"');

      if (errors.length > 0) {
        results.push({
          label: `${file}`,
          status: 'error',
          message: errors.join('; '),
        });
      }
    }
  } catch (err) {
    results.push({
      label: 'Agents',
      status: 'warn',
      message: `Could not scan agents directory: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

function validateSkills(skillsDir: string): DetailItem[] {
  const results: DetailItem[] = [];

  if (!existsSync(skillsDir)) {
    results.push({ label: 'Skills directory', status: 'warn', message: 'Not found' });
    return results;
  }

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const dirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith('__') && !e.name.startsWith('.'),
    );
    const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

    let validCount = 0;
    let orphanFiles = 0;
    let missingDefs = 0;

    // Check directories have SKILL.md
    for (const dir of dirs) {
      const skillPath = join(skillsDir, dir.name, SKILL_FILE);
      if (!existsSync(skillPath)) {
        missingDefs++;
        results.push({
          label: `${dir.name}/: missing SKILL.md`,
          status: 'warn',
        });
      } else {
        const content = readText(skillPath);
        if (content) {
          const { data } = parseFrontmatter(content);
          if (data.name || data.description) {
            validCount++;
          }
        }
      }
    }

    // Check standalone .md files are not orphans
    for (const file of files) {
      if (file.name === 'README.md') continue;
      const baseName = file.name.replace(/\.md$/, '');
      const hasDir = dirs.some((d) => d.name === baseName);
      if (!hasDir) {
        orphanFiles++;
        results.push({
          label: `${file.name}: standalone .md without directory`,
          status: 'warn',
        });
      }
    }

    results.push({
      label: `Skills (${validCount} valid, ${missingDefs} missing SKILL.md, ${orphanFiles} orphans)`,
      status: missingDefs > 0 || orphanFiles > 0 ? 'warn' : 'ok',
    });
  } catch (err) {
    results.push({
      label: 'Skills',
      status: 'warn',
      message: `Could not scan skills directory: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  return results;
}

/** Validate global skills in ~/.agents/skills/ and check for staleness vs project copy */
function validateGlobalSkills(globalSkillsDir: string, projectSkillsDir: string): DetailItem[] {
  const results: DetailItem[] = [];

  if (!existsSync(globalSkillsDir)) {
    results.push({
      label: 'Global skills (~/.agents/skills/)',
      status: 'warn',
      message: 'Directory not found',
    });
    return results;
  }

  try {
    const entries = readdirSync(globalSkillsDir, { withFileTypes: true });
    const dirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith('__') && !e.name.startsWith('.'),
    );

    let validCount = 0;
    let staleCount = 0;

    for (const dir of dirs) {
      const globalSkillPath = join(globalSkillsDir, dir.name, 'SKILL.md');
      const projectSkillPath = join(projectSkillsDir, dir.name, 'SKILL.md');

      if (!existsSync(globalSkillPath)) {
        results.push({
          label: `${dir.name}/ (global): missing SKILL.md`,
          status: 'warn',
        });
        continue;
      }

      const globalContent = readText(globalSkillPath);
      if (!globalContent) {
        results.push({
          label: `${dir.name}/ (global): SKILL.md empty`,
          status: 'error',
        });
        continue;
      }

      const { data } = parseFrontmatter(globalContent);
      if (data.name || data.description) validCount++;

      // Staleness check: compare project copy vs global source
      if (existsSync(projectSkillPath)) {
        const projectContent = readText(projectSkillPath);
        if (projectContent && projectContent !== globalContent) {
          staleCount++;
          results.push({
            label: `${dir.name}: project copy stale vs global source`,
            status: 'warn',
            message: 'Run update to sync from ~/.agents/skills/',
          });
        }
      }

      // agent-reach specific: verify 6 reference files exist
      if (dir.name === 'agent-reach') {
        const refDir = join(globalSkillsDir, dir.name, 'references');
        const expectedRefs = ['search', 'social', 'career', 'dev', 'web', 'video'];
        let missingRefs = 0;
        for (const ref of expectedRefs) {
          if (!existsSync(join(refDir, `${ref}.md`))) {
            missingRefs++;
            results.push({
              label: `agent-reach/references/${ref}.md`,
              status: 'error',
              message: 'Missing reference file',
            });
          }
        }
        if (missingRefs === 0) {
          results.push({
            label: `agent-reach references (${expectedRefs.length} files)`,
            status: 'ok',
          });
        }
      }
    }

    results.push({
      label: `Global skills (${validCount} valid, ${staleCount} stale vs project)`,
      status: staleCount > 0 ? 'warn' : 'ok',
    });
  } catch (err) {
    results.push({
      label: 'Global skills',
      status: 'warn',
      message: `Could not scan: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

function validateHooksConfig(hooksDir: string): DetailItem[] {
  const results: DetailItem[] = [];

  if (!existsSync(hooksDir)) {
    results.push({
      label: 'Hooks directory',
      status: 'warn',
      message: 'Not found',
    });
    return results;
  }

  // Validate hooks-settings.json
  const settingsPath = join(hooksDir, 'hooks-settings.json');
  if (existsSync(settingsPath)) {
    const json = readJSON(settingsPath);
    if (json) {
      results.push({
        label: 'hooks-settings.json: valid JSON',
        status: 'ok',
      });
    } else {
      results.push({
        label: 'hooks-settings.json: invalid JSON',
        status: 'error',
      });
    }
  } else {
    results.push({
      label: 'hooks-settings.json',
      status: 'warn',
      message: 'Not found',
    });
  }

  // Check hooks-config files
  for (const configFile of ['hooks-config.json', 'hooks-config.local.json']) {
    const path = join(hooksDir, configFile);
    if (existsSync(path)) {
      const json = readJSON(path);
      results.push({
        label: `${configFile}: ${json ? 'valid JSON' : 'invalid JSON'}`,
        status: json ? 'ok' : 'error',
      });
    }
  }

  // Check scripts directory if it exists
  const scriptsDir = join(hooksDir, 'scripts');
  if (existsSync(scriptsDir)) {
    const scripts = readdirSync(scriptsDir).filter(
      (f) => f.endsWith('.js') || f.endsWith('.sh') || f.endsWith('.ps1'),
    );
    if (scripts.length > 0) {
      results.push({
        label: `Hook scripts (${scripts.length} found)`,
        status: 'ok',
        message: scripts.join(', '),
      });
    }
  }

  return results;
}

function validateSettings(claudeDir: string): DetailItem[] {
  const results: DetailItem[] = [];

  for (const file of ['settings.json', 'settings.local.json']) {
    const path = join(claudeDir, file);
    if (existsSync(path)) {
      const json = readJSON(path);
      results.push({
        label: `${file}: ${json ? 'valid JSON' : 'invalid JSON'}`,
        status: json ? 'ok' : 'error',
      });
    }
  }

  return results;
}
