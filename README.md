# OpenCode Go Provider Plugin for OpenFox

OpenCode Go provider plugin for OpenFox (`openfox-opencode-go`).

Access curated open coding models with generous limits via your OpenCode Go subscription ($10/month) directly within OpenFox.

## Features

- **Curated Go Models Lineup:** Includes only the officially supported models available under the OpenCode Go subscription.
- **Quota-Sorted:** Models are ordered by quota allowance (highest request volume per 5 hours / multiplier first).
- **Temporary Usage Boosts Detection:** Automatically detects and applies temporary usage limit boosts (such as 2x usage promos) and re-sorts models dynamically.
- **Notifications:** In-app notifications when models are added, removed, when usage limits receive a temporary boost, or when limits return to normal.
- **Multi-protocol Transport:** Automatically routes requests across `/chat/completions`, `/messages` (Anthropic format), and `/responses` (OpenAI format).

## Setup & Authentication

1. Subscribe to OpenCode Go on [opencode.ai/go](https://opencode.ai/go).
2. Retrieve your API key from [opencode.ai/auth](https://opencode.ai/auth).
3. Connect the provider in OpenFox and enter your API key.

## Available Models (sorted by quota)

- **Muse Spark 1.3 Contributor** (45,300 req/5h)
- **Muse Spark 1.2 Contributor** (45,300 req/5h)
- **MiMo-V2.5** (30,100 req/5h)
- **Omen Alpha** (11,600 req/5h)
- **LongCat-2.0** (11,400 req/5h)
- **DeepSeek V4 Flash** (7,600 req/5h)
- **Qwen3.8 Flash** (5,400 req/5h)
- **Qwen3.7 Plus** (4,300 req/5h)
- **Hy3** (4,300 req/5h)
- **DeepSeek V4 Flash Vision Exp** (3,800 req/5h)
- **MiniMax M2.7 / M2.5** (3,400 req/5h)
- **Qwen3.6 Plus** (3,300 req/5h)
- **MiMo-V2.5-Pro** (3,250 req/5h)
- **MiniMax M3** (3,200 req/5h)
- **GPT 5.6 Luna** (2,050 req/5h)
- **GLM-5.3-Flash** (1,580 req/5h, subject to temporary 2x boosts)
- **Hy4 preview** (1,350 req/5h)
- **Kimi K2.7 Code** (1,350 req/5h)
- **Kimi K2.6** (1,150 req/5h)
- **DeepSeek V4 Pro** (1,050 req/5h)
- **GLM-5.2 / GLM-5.1** (880 req/5h)
- **GLM-5.3** (220 req/5h)
- **Qwen3.7 Max** (170 req/5h)
- **Grok 4.6** (169 req/5h)
- **Qwen3.8 Max** (160 req/5h)
- **Kimi K3** (110 req/5h)

## License

MIT
