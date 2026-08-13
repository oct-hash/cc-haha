/**
 * enrich-papers.ts
 * 为所有416篇论文补充DOI信息、分区评分
 * 用法: bun scripts/enrich-papers.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'

const INDEX_PATH = 'D:/hermes-kb/wiki/papertree/index.json'
const http = globalThis.fetch || (await import('node-fetch').then((m) => m.default))

// ========== SCI期刊分区映射（基于中科院期刊分区表 + 心血管/铁死亡领域常见期刊）========== //
const JOURNAL_PARTITION = {
  // T1: 国际顶级期刊（SCI 1区 top）
  Cell: 1,
  Nature: 1,
  Science: 1,
  'Nature Reviews Drug Discovery': 1,
  'Nature Reviews Cardiology': 1,
  'Nature Cell Biology': 1,
  'Nature Communications': 1,
  'Cell Research': 1,
  'Cell Death & Differentiation': 1,
  'Molecular Cell': 1,
  'Cell Reports': 1,
  Circulation: 1,
  'Circulation Research': 1,
  'Journal of the American College of Cardiology': 1,
  'Cancer Cell': 1,
  'Advanced Science': 1,
  'Signal Transduction and Targeted Therapy': 1,
  'Pharmacology & Therapeutics': 1,
  'New England Journal of Medicine': 1,
  PNAS: 1,

  // T2: 国际知名期刊（SCI 2区）
  Autophagy: 2,
  'Redox Biology': 2,
  'Archives of Toxicology': 2,
  'Pharmacological Research': 2,
  'British Journal of Pharmacology': 2,
  'Acta Pharmaceutica Sinica B': 2,
  'Journal of Controlled Release': 2,
  'Free Radical Biology and Medicine': 2,
  Antioxidants: 2,
  'International Journal of Molecular Sciences': 2,
  Biomaterials: 2,
  'ACS Applied Materials & Interfaces': 2,
  'Cell Death & Disease': 2,
  iScience: 2,
  'Molecular Cancer': 2,
  Gene: 2,

  // T3: 较好期刊（SCI 3区）
  Phytomedicine: 3,
  'Journal of Ethnopharmacology': 3,
  'European Journal of Pharmacology': 3,
  'Food & Function': 3,
  'Biomedicine & Pharmacotherapy': 3,
  Nutrients: 3,
  'International Immunopharmacology': 3,
  'Redox Report': 3,
  'Life Sciences': 3,
  'Experimental Cell Research': 3,
  'Molecular and Cellular Biochemistry': 3,
  'Molecular Medicine': 3,
  'Frontiers in Pharmacology': 3,
  'Frontiers in Cell and Developmental Biology': 3,
  'Frontiers in Molecular Biosciences': 3,
  'Frontiers in Cardiovascular Medicine': 3,
  'Oxidative Medicine and Cellular Longevity': 3,
  Inflammation: 3,
  'Journal of Translational Medicine': 3,
  'Drug Design, Development and Therapy': 3,
  'ACS Chemical Biology': 3,
  'Biochemical and Biophysical Research Communications': 3,
  'Biochemical Pharmacology': 3,
  'Phytotherapy Research': 3,
  'European Journal of Medicinal Chemistry': 3,
  Molecules: 3,
  Biomedicines: 3,
  'Journal of Cellular and Molecular Medicine': 3,
  'Cellular Signalling': 3,
  'Molecular Medicine Reports': 3,
  'Acta Pharmacologica Sinica': 3,
  'Journal of Molecular and Cellular Cardiology': 3,
  'Toxicology and Applied Pharmacology': 3,
  Cells: 3,
  'International Journal of Nanomedicine': 3,
  'Journal of Nanobiotechnology': 3,
  Biomolecules: 3,
  'International Journal of Biological Sciences': 3,
  Aging: 3,
  'Biochimica et Biophysica Acta (BBA) - Molecular Basis of Disease': 3,
  Bioengineered: 3,
  'Cardiovascular Diabetology': 3,
  'Journal of Diabetes Research': 3,
  'Diabetes Research and Clinical Practice': 3,
  'Ecotoxicology and Environmental Safety': 3,
  'Chinese Journal of Integrative Medicine': 3,
  'Chinese Journal of Chinese Materia Medica': 3, // 中国药理学报（中文核心）
  'Acta Cardiologica Sinica': 3,

  // T4: 较低水平期刊（SCI 4区或其他）
  'Scientific Reports': 4,
  'PLOS ONE': 4,
  Heliyon: 4,
  'BMC Complementary Medicine and Therapies': 4,
  'BMC Cardiovascular Disorders': 4,
  'American Journal of Cardiovascular Disease': 4,
  'Journal of Traditional and Complementary Medicine': 4,
  'Molecular Biotechnology': 3, // 移到这里
  'Molecular Biomedicine': 3,
  'Experimental and Therapeutic Medicine': 3,
  'Journal of Cardiovascular Translational Research': 3,
  'Journal of Cardiovascular Pharmacology and Therapeutics': 3,
  'Molecular and Cellular Endocrinology': 3,
  'Biochemistry and Biophysics Reports': 3,
  'Experimental and Molecular Pathology': 3,
  'Journal of Zhejiang University-SCIENCE B': 3,
  'Journal of Geriatric Cardiology': 3,
  'Reviews in Cardiovascular Medicine': 3,
  'Frontiers in Physiology': 3,
}

function getPartition(journal: string): number | null {
  if (!journal) return null
  // HTML实体处理
  const clean = journal.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return (JOURNAL_PARTITION as Record<string, number>)[clean] || 3 // 未收录默认3区
}

function _getPartitionLabel(partition: number | null): string {
  if (partition === 1) return 'T1国际顶级'
  if (partition === 2) return 'T2国际知名'
  if (partition === 3) return 'T3较好'
  if (partition === 4) return 'T4其他'
  return '未知'
}

// ========== CrossRef查询 ========== //
async function queryCrossRef(doi: string) {
  try {
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '')
    const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`
    const resp = await http(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const work = data.message
    return {
      type: work.type,
      title: work.title?.[0] || '',
      author: (work.author || [])
        .map((a: { given?: string; family?: string }) => `${a.given || ''} ${a.family || ''}`)
        .filter(Boolean),
      published: work.published?.['date-parts']?.[0]?.[0],
      journal: work['container-title']?.[0] || '',
      ISSN: work.ISSN?.[0] || '',
      volume: work.volume,
      issue: work.issue,
      pages: work.page,
    }
  } catch (_e) {
    return null
  }
}

// ========== 主程序 ========== //
async function main() {
  console.log('📖 读取 index.json...')
  const raw = readFileSync(INDEX_PATH, 'utf-8')
  const data = JSON.parse(raw)
  const papers: any[] = data.papers

  console.log(`共 ${papers.length} 篇论文，开始补充...`)

  let updated = 0
  let skipped = 0

  for (let i = 0; i < papers.length; i++) {
    const p = papers[i]
    const progress = `[${i + 1}/${papers.length}]`

    // 跳过无DOI的7篇
    if (!p.doi) {
      console.log(`${progress} 跳过无DOI: ${p.id}`)
      skipped++
      continue
    }

    const doi = p.doi.replace(/^https?:\/\/doi\.org\//, '').trim()
    if (!doi) {
      skipped++
      continue
    }

    // 如已有journal且有分区，跳过
    if (p.journal && p.partition) {
      console.log(`${progress} 已有分区: ${p.id} → T${p.partition}`)
      continue
    }

    const info = await queryCrossRef(doi)
    await setTimeout(150) // 避免过快请求

    if (info) {
      let changed = false
      if (!p.journal && info.journal) {
        p.journal = info.journal
        changed = true
      }
      if (!p.authors || p.authors.length === 0) {
        p.authors = info.author || []
        changed = true
      }
      if (!p.year && info.published) {
        p.year = String(info.published)
        changed = true
      }
      const partition = getPartition(p.journal)
      if (partition && !p.partition) {
        p.partition = partition
        changed = true
      }

      if (changed) {
        updated++
        console.log(
          `${progress} ✅ ${doi} | T${partition || '?'} | ${(p.journal || '').substring(0, 40)}`,
        )
      } else {
        console.log(`${progress} ⏭️  ${doi} (无变化)`)
      }
    } else {
      // CrossRef查不到，设分区为默认值
      const partition = getPartition(p.journal)
      if (partition && !p.partition) {
        p.partition = partition
        updated++
        console.log(`${progress} ⚠️  CrossRef无结果，但有journal: ${p.id} → T${partition}`)
      } else {
        console.log(`${progress} ❌ CrossRef无结果: ${doi}`)
      }
    }
  }

  writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2))
  console.log(`\n💾 完成，更新了 ${updated} 篇，跳过 ${skipped} 篇`)
}

main().catch(console.error)
