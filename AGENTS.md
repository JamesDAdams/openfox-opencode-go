# AGENTS.md — openfox-opencode-go

Paths relative to `openfox-plugins/openfox-opencode-go/`.

## Purpose

OpenFox LLM provider to access OpenCode Go models ($10/month subscription) with curated models, quota-based sorting, boost detection, notifications, and multi-protocol support.

## Stack

- TypeScript, ESM, tsup, vitest 4.x
- peerDep: `openfox >=2.0.56 <3`
- Dependency: `@types/better-sqlite3`

## Commands

```bash
npm run build      # tsup
npm test           # vitest run --passWithNoTests
npm run typecheck  # tsc --noEmit
```

## Project Map

```
src/
├── index.ts                     # Entry point (register, preset)
├── types.ts                     # TypeScript types
├── settings.ts                  # Settings
├── sync-manager.ts              # Synchronization
├── models.ts                    # OPENCODE_GO_MODELS, ModelsCacheStore
├── auth/
│   └── opencode-auth.ts         # OpenCode auth
├── credentials/
│   └── file-credential-store.ts # File credential store
├── quota/
│   ├── opencode-go.ts           # Quota management
│   └── contract.ts              # Quota contract (shared)
└── transport/
    └── opencode-go.ts           # Multi-protocol transport
```

## Where to Look What

- **Modify HTTP transport** → `src/transport/opencode-go.ts`
- **Modify authentication** → `src/auth/opencode-auth.ts`
- **Modify quota handling** → `src/quota/opencode-go.ts`
- **Add a model** → `src/models.ts` (OPENCODE_GO_MODELS)
- **Add a setting** → `src/settings.ts`

## Conventions

- `apiVersion: 2`, capabilities: `tools`, `hooks`, `rpc`, `presets`
- ESM build only via tsup
- `openfox` and `better-sqlite3` are externalized
- `.test.ts` files are co-located in `src/`

## Cross-Project Dependencies

**Consumes**: `openfox/provider` (ProviderPluginRegistry, ProviderPreset), `openfox-quota` contract via `src/quota/contract.ts`.

**Consumed by**: OpenFox (loaded as provider plugin).

**Touchpoints**:

- `src/index.ts` (register, preset)
- `src/quota/contract.ts` (quota contract)
- `src/transport/opencode-go.ts` (multi-protocol transport)
- `src/models.ts` (OPENCODE_GO_MODELS, ModelsCacheStore)

## Known Gotchas

- `dist/index.js` is the entry point loaded by OpenFox, not `src/`.
- `models-cache.json` is a generated file (models cache), do not edit.
- `better-sqlite3.d.ts` is a type declaration file, do not edit.
- The quota contract (`src/quota/contract.ts`) is shared across provider plugins.
- The transport receives host-resolved messages: for vision-capable models the
  image data URL stays on `msg.attachments`, and this adapter is responsible for
  serializing it into each protocol's multimodal shape (handled in the helpers
  at the top of `src/transport/opencode-go.ts`). Non-image attachments are
  already inlined into `content` by the host.
- Multi-protocol: automatic routing between `/chat/completions`, `/messages` (Anthropic), `/responses` (OpenAI).

## Do Not Read / Do Not Touch

- `node_modules/`, `dist/`, `.git/`
- `models-cache.json`

## Further Reading

- [README.md](README.md) — overview

---

> After any change affecting structure, a command, a convention, an inter-project contract, or a primary flow, update this file in the same commit. If any information here is inaccurate, fix it.
