---
name: add-model-provider
description: 向项目中添加新的模型提供商（如 DeepSeek、OpenAI 等）
---

# Add New Model Provider

Add a new model provider (like DeepSeek, OpenAI, etc.) to the project.

## Steps

### 1. Add model definition

Create or update `src/utils/model/configs.ts`:
```typescript
export const CLAUDE_PROVIDER_MODEL_CONFIG = {
  firstParty: 'model-id',
  // ... other providers
} as const
```

### 2. Add model catalog (if needed)

For custom providers, add to `src/utils/model/modelCatalog.ts`.

### 3. Add provider API handling

If provider uses non-standard API, add handling in `src/utils/api.ts`.

### 4. Update aliases (optional)

Update `src/utils/model/aliases.ts` if you want short aliases like "ultra".

### 5. Add auth profile

Add credentials to `~/.openclaw/agents/main/agent/auth-profiles.json`:
```json
"provider:default": {
  "type": "api_key",
  "provider": "provider",
  "key": "your-api-key"
}
```

### 6. Configure default model

Update `~/.openclaw/openclaw.json`:
```json
{
  "agents": {
    "defaults": {
      "model": "provider/model-id"
    }
  }
}
```

## Example: Adding DeepSeek

```typescript
// src/agents/deepseek-models.ts
export const DEEPSEEK_MODEL_CATALOG = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    reasoning: false,
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    reasoning: true,
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 65536,
  },
]
```

## Testing

```bash
# Test model availability
openclaw models list

# Test API connection
openclaw doctor
```
