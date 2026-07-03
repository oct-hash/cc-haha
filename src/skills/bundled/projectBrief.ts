import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { registerBundledSkill } from '../bundledSkills.js'
import { SKILL_FILES, SKILL_MD } from './projectBriefContent.js'

const { frontmatter, content: SKILL_BODY } = parseFrontmatter(SKILL_MD)

const DESCRIPTION =
  typeof frontmatter.description === 'string'
    ? frontmatter.description
    : 'Generate a project summary.'

export function registerProjectBriefSkill(): void {
  registerBundledSkill({
    name: 'project-brief',
    description: DESCRIPTION,
    userInvocable: true,
    files: SKILL_FILES,
    async getPromptForCommand(args) {
      const parts: string[] = [SKILL_BODY.trimStart()]
      if (args) {
        parts.push(`## Focus\n\n${args}`)
      }
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}
