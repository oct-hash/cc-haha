/**
 * 直接测试 QQ Mail 同步（绕过 MCP）
 */
import { createQQMailIMAP } from './src/services/channels/qqmail/imap.js'
import { createMatcher } from './src/services/channels/qqmail/matcher.js'
import { createDownloader } from './src/services/channels/qqmail/downloader.js'

const QQ_USER = process.env.QQ_USER || '35050503@qq.com'
const QQ_AUTH_CODE = process.env.QQ_AUTH_CODE || 'ylzerpgiktfebiac'
const KB_INDEX_PATH = process.env.KB_INDEX_PATH || 'D:/hermes-kb/wiki/papertree/index.json'
const KB_GRAPH_PATH = process.env.KB_GRAPH_PATH || 'D:/hermes-kb/wiki/papertree/graph.json'

async function main() {
  console.log('QQ User:', QQ_USER ? 'OK' : 'MISSING')
  console.log('KB Index:', KB_INDEX_PATH)

  // Connect IMAP
  console.log('Connecting IMAP...')
  const imap = createQQMailIMAP({ user: QQ_USER, authCode: QQ_AUTH_CODE })
  await imap.connect()
  console.log('IMAP connected!')

  // Load matcher
  console.log('Loading matcher...')
  const matcher = createMatcher(KB_INDEX_PATH, KB_GRAPH_PATH)
  await matcher.load()
  console.log('Matcher loaded, papers:', matcher.getAllPapers().length)

  // List emails
  console.log('Listing emails...')
  const emails = await imap.listEmails({ limit: 5 })
  console.log(`Found ${emails.length} emails`)

  for (const mail of emails) {
    console.log(`- [${mail.uid}] ${mail.subject} (${mail.attachments.length} PDFs)`)
    for (const att of mail.attachments) {
      const match = matcher.matchAttachment(att, mail.subject)
      if (match) {
        console.log(`  ✓ ${att.filename} → matches ${match.paper.id} (${match.matchType})`)
      } else {
        console.log(`  ? ${att.filename} → no match (new paper)`)
      }
    }
  }

  await imap.disconnect()
  console.log('Done!')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
