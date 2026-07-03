// Content for the project-brief bundled skill.
// SKILL.md is inlined at build time via Bun's text loader.

import skillMd from './projectBrief/SKILL.md'

export const SKILL_MD: string = skillMd

export const SKILL_FILES: Record<string, string> = {}
