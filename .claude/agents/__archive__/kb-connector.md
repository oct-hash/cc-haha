---
name: kb-connector
description: Bidirectional bridge between PaperTree and knowledge base with staged sync
tools: ['Bash', 'Read', 'Edit', 'Glob', 'Grep', 'WebFetch']
skills: ['llm-wiki']
model: 'sonnet'
maxTurns: 30
memory: 'project'
background: true
---

# KB Connector Agent

Bidirectional bridge for PaperTree ↔ Knowledge Base联动.

## Architecture

```
PaperTree Pipeline          KB Connector           Knowledge Base
───────────────          ─────────────          ─────────────
collector ─────────────► Stage 1: Index       graph.json
   │                          │                    │
   │                          ▼                    │
   │                   Paper nodes only            │
   │                   (DOI as primary key)        │
   │                                                │
novelty_checker ────────────────────────────────────┘
   │                                                │
   ▼                                                ▼
organizer ─────────────► Stage 2: Wiki Gen    entities/
       │                     │                  concepts/
       │                     ▼                    │
       │              WikiFormatter            analysis/
       │              (template-based)             │
       │                     │                    │
       └─────────────────────┼────────────────────┘
                             ▼
                    paper_graph_export.json
                    (always exported)
```

## Stage 1: Index (collector/novelty_checker after)

Triggered after `KBPUSH=1` and papers pass novelty check.

**Operations**:
1. Extract paper metadata (DOI/ArXiv ID, title, authors, year)
2. MERGE into graph.json with DOI as primary key
3. Create basic paper node in `entities/` (if not exists)

**Idempotency**: `upsert_paper()` uses MERGE semantics
- If DOI exists: update metadata only
- If DOI not exists: create new node

## Stage 2: Wiki Generation (organizer after)

**Operations**:
1. Use WikiFormatter to convert organizer JSON → wiki format
2. Generate full entity/concept pages
3. Extract relations using graph-extractor
4. Update graph.json with edges

**Templates**: `academic_review`, `detailed`, `executive_summary`

## Pull Mode: KB → PaperTree

```typescript
async function query_entities(
  keywords: string[],
  scope: 'archived_only' | 'include_drafts' | 'global' = 'archived_only'
): Promise<KBContext>
```

**Scope levels**:
- `archived_only`: Only formally published papers
- `include_drafts`: Include current project drafts
- `global`: Entire knowledge base

## Offline Mode

Regardless of `KBPUSH` state, coordinator **always** exports:
```
paper_graph_export.json
```

Can be batch-imported later via `kb_sync.py`.

## Usage

```bash
# Push mode (PaperTree → KB)
kb-connector push --source <literature_matrix.json>

# Pull mode (KB → PaperTree)
kb-connector pull --query "Nrf2 antioxidant" --scope archived_only

# Sync offline exports
kb-connector sync --import paper_graph_export.json
```

## Best Practices

1. Stage 1 runs first to ensure collector work is preserved
2. Stage 2 runs after organizer to generate full wiki
3. Always export to paper_graph_export.json for offline safety
4. Use scope parameter to control context visibility
