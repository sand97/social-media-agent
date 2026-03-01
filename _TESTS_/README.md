# Live Agent Tests

This folder documents the live-model end-to-end test suites.

## Goal

Run the agents with real LLM providers (Gemini/OpenAI/xAI), while mocking tool implementations and external API calls.

This validates:

- Tool selection logic by the model
- Multi-tool execution in the same run
- History-aware routing behavior
- Agent middleware + LangGraph execution path

## Suites

- WhatsApp agent live tests:
  - `apps/whatsapp-agent/_TESTS_/live-agent/whatsapp-agent.live.e2e.test.ts`
- Backend onboarding agent live tests:
  - `apps/backend/_TESTS_/live-agent/onboarding-agent.live.e2e.test.ts`

## Run

Enable live tests explicitly:

```bash
AGENT_LIVE_TESTS=true pnpm test:agents:live
```

Or run one side:

```bash
AGENT_LIVE_TESTS=true pnpm --filter whatsapp-agent test:agent:live
AGENT_LIVE_TESTS=true pnpm --filter backend test:agent:live
```

## Tracing

LangSmith tracing is enabled when:

- `AGENT_LIVE_TESTS=true`
- `LANGSMITH_TRACING=true` (or omitted and auto-enabled in test setup)
- `LANGSMITH_API_KEY` is available
