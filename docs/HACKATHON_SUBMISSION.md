# BOUND — Hackathon Submission

**Primary track:** AI Agents\
**Secondary positioning:** Finance & Commerce\
**Prototype network:** BNB Smart Chain Testnet, chainId 97

## Submission description

BOUND is the intent-integrity layer for autonomous AI agents that spend money.

The Agent starts with deterministic transaction evidence from BOUND Lens. It can answer directly, execute a registered free tool and reason again, or select a paid capability. Paid selection pauses execution at BOUND Guard.

A human authorizes the exact request and payment boundary, then anchors that intent on BSC Testnet. Guard checks the actual request and fresh payment challenge before the separate server payer can execute. Successful paid evidence feeds back into the Agent runtime.

The prototype includes a successful 0.001 TEST_USDT payment, a matching on-chain intent commitment, and separate recorded request-drift attempts blocked before payment. BOUND Proof exposes durable application metadata for these events.

The selected historical run’s raw provider response and final Agent answer were not recovered. The submission distinguishes verified payment/history evidence from the continuation behavior implemented in current source.

## Elevator pitch — 30–45 seconds

BOUND lets an AI agent choose its next step while keeping payment tied to human intent.

The agent starts with transaction evidence. It can answer, use a free tool, or request a paid capability. When money is involved, it pauses.

The human approves the exact request and payment limit. BOUND checks that request again before the server wallet pays. If it changed, execution stops.

Our BSC Testnet prototype has a successful payment and matching intent commitment, plus recorded drift attempts blocked before payment.

The principle is simple: the agent chooses what it needs; the human controls what it may spend.

## Recording approach

Use the actual application, your own voice, and a single screen recording. Target 4–5 minutes. No avatar or concept animation is needed.

This recording does not require a new payment, authorization, or anchor.

Show current Agent behavior live. Show the canonical payment, matching anchor, and BLOCK attempts as explicitly labeled historical evidence.

Do not present a fresh answer as the historical paid answer. The original provider response and continuation output are unavailable.

## Before recording

Prepare these tabs:

1. Workspace `/app`, using the canonical subject transaction from the README.
2. Existing installation’s `/proof` history.
3. Canonical intent-anchor transaction on BscScan.
4. Canonical payment transaction on BscScan.
5. `src/api/mpp-product-server.ts`, positioned at the paid-observation construction and `runAgentRuntime` continuation.

Keep payments disabled. Do not sign or anchor anything during rehearsal.

Rehearse an existing-evidence question, a free-tool question, and a mission that selects the registered paid analysis capability. Use the actual decisions the runtime returns; do not promise a fixed branch from an untested prompt.

If a provider is needed to prepare the Guard view, start it with the documented configuration. Service startup is not payment approval.

Use short, tested missions and paste them during recording. If a request finishes before you reach its explanation, use the recorded activity already visible in the interface.

## Single-take script — approximately 4:45

### 0:00–0:30 — Problem and mission

**Screen/action:** Start on the Workspace. Enter the canonical subject transaction and begin inspection.

**Narration:**

“An AI agent may know which tool it needs, but that does not mean it should control payment. There is also a second problem: the request reaching payment might have changed since the human approved it.

BOUND keeps payment tied to the exact authorized request. I’m using a transaction-analysis task on BNB Smart Chain Testnet to show that boundary.”

### 0:30–1:00 — Lens and evidence

**Screen/action:** Show the returned transaction evidence. Submit the rehearsed question that can be answered from existing evidence.

**Narration:**

“This is BOUND Lens, the Agent’s perception layer. It collects transaction and receipt evidence before the Agent reasons about the task.

When that evidence is enough, the Agent answers directly. There is no reason to open Guard or ask for payment. The activity shown here records what the runtime did; it does not expose private chain-of-thought.”

### 1:00–1:45 — Autonomous tool use

**Screen/action:** Run the rehearsed free-tool mission. Show the selected tool, ACT, OBSERVE, subsequent REASON event, and actual result.

**Narration:**

“For this question, the Agent needs another piece of evidence. It selects a capability from the host’s registered tools.

The important part is what happens after the call. The result becomes an observation, and the Agent reasons again. It can answer, look for another applicable capability, or stop with a remaining limitation.

The model chooses among registered tools. It cannot invent a payment tool or change a free tool into a paid one.”

**If the actual run stops with a limitation:** State that limitation instead of describing a successful answer.

### 1:45–2:25 — Paid selection and pause

**Screen/action:** Run the rehearsed paid-capability mission. Show the selection, PAUSE, and the available request/Guard review. Do not authorize or execute.

**Narration:**

“Here the Agent selects paid transaction analysis. That changes the execution boundary: the runtime pauses.

The human must authorize this concrete request, including its payment recipient, token, limit, and expiry. The human wallet signs authorization and anchors intent. A separate server wallet would execute payment.

I’m stopping the live flow here. Nothing in this recording authorizes a new payment. I’ll use an existing completed run to show the on-chain evidence.”

### 2:25–3:15 — Historical authorization and payment

**Screen/action:** Show the canonical history entries, then the matching anchor and payment tabs.

**Narration:**

“These records are from October 5. The intent anchor commits the request hash and payment boundary under the human authorizer.

The recorded authorized and actual request hashes match. Notice that READY is separate from COMPLETED: passing authorization checks does not itself send money.

This matching payment transaction shows the successful 0.001 TEST_USDT transfer. The application’s completed execution record also reports that the payer was invoked and payment was broadcast.

The subject transaction we analyzed is a different transaction. BOUND did not replay it.”

### 3:15–3:50 — Paid continuation and evidence limit

**Screen/action:** Briefly show the source section that builds the paid observation and calls `runAgentRuntime` with the original goal. Keep this a source walkthrough, not a simulated result.

**Narration:**

“After successful paid execution, this code turns the provider result into an Agent observation and enters the runtime again with the original goal. That is where the Agent reasons over the evidence it requested.

For this historical run, the original provider response and final Agent answer were not retained in the available history. I can show the implemented continuation and verified payment evidence, but I cannot replay that old answer.”

### 3:50–4:25 — Historical drift and BLOCK

**Screen/action:** Return to Proof. Show a recorded tampered attempt with differing request hashes and `payerInvoked=false`, `paymentBroadcast=false`.

**Narration:**

“This is a separate historical security-demo session. The actual request hash differs from the authorized hash, so Guard blocks the protected execution path.

For this attempt, the payer was not invoked and no payment was broadcast. That statement applies to this blocked attempt. A later normal attempt in the same session did pay.

The boundary is deterministic: changing the authorized request cannot be justified by another model response.”

### 4:25–4:45 — Close

**Screen/action:** Leave Proof visible, with the relevant decision and execution metadata.

**Narration:**

“BOUND Proof keeps these application events reviewable alongside the on-chain references. It is not an immutable log of every Agent step.

This prototype is scoped to BSC Testnet. Its core separation is clear: autonomy before the boundary, exact human authorization at the boundary, and Agent reasoning after the result.”

## Live versus historical

| Material | Presentation |
|---|---|
| Lens inspection | Live, read-only |
| Existing-evidence answer | Live |
| Free-tool action, observation, and subsequent reasoning | Live |
| Paid capability selection and pause | Live; stop before authorization |
| Canonical anchor and payment | Historical blockchain evidence |
| Paid continuation implementation | Source walkthrough; not a recovered execution |
| Canonical historical final answer | Unavailable; do not reconstruct or impersonate it |
| Request-drift BLOCK | Historical application records from a separate session |
| Proof page | Live viewing of historical application metadata |

If latency prevents completing the recording within five minutes, shorten the spoken introduction and keep the actual results visible. Do not disguise earlier results as a current execution.

## Proof checklist

Use the [README proof table](../README.md#bsc-testnet-deployment-and-proof) for full explorer links.

### Canonical October 5 execution

- [ ] Registry: `0xc85EdD8C5084195c4781dEE49611989127cAdB6b`.
- [ ] Anchor: `0xb1a8cd53a7dce07f0527c3f782b5b651558c0a3f52f79746ba2e42276980a66a`.
- [ ] Payment: `0xdfdd06240925f028342c16f99c1d23c5072c0ce1cd5c0499e846f658f320ecc1`.
- [ ] Authorization ID: `217dc6cf-b4c7-4235-bae9-4e8d3a630d58`.
- [ ] Authorized and actual request hashes match the README.
- [ ] History shows PAUSE → CONFIRMED → ANCHORED → READY → paid execution COMPLETED.
- [ ] COMPLETED event: `b7101d95-d86a-4b9e-95ca-fa4ca84fa4c7`.
- [ ] Explain that paid execution completion does not independently prove the unrecovered final Agent answer.

### Separate drift session

Use either historical BLOCK event:

```text
75c163d1-dcde-4fdb-879e-95386359ab51
4087b2a8-4caa-4cd1-a367-8f2a25058aec

Authorization:
6054cb40-fce6-49e0-8ee9-8978510c796f

Authorized request hash:
0x336f9be7cf5d55c2bc1913b105cc0557a5cbc4250e6c1b77476fd214efce92b2

Actual request hash:
0x4e8ea2ec43ed3dd68246f70dc81c36af8b5db9addef1847c009ee4aa46d10a7c
```

Both attempts record `BLOCKED / STOPPED`, `payerInvoked=false`, and `paymentBroadcast=false`.

They are not part of the canonical October 5 payment session. A later normal attempt under this separate authorization succeeded; do not characterize its entire history as unpaid.

## Final recording checklist

- [ ] Use the existing installation containing the historical activity records.
- [ ] Keep `BOUND_ALLOW_REAL_PAYMENT` disabled.
- [ ] Verify the actual UI fields and rehearsed Agent branches before recording.
- [ ] Open canonical explorer links directly; do not substitute the older default payment reference.
- [ ] Keep secrets, environment files, wallet recovery information, and unrelated tabs off screen.
- [ ] Use readable zoom and a tested microphone.
- [ ] Keep raw provider evidence collapsed unless needed.
- [ ] Clearly say when switching from live behavior to historical evidence.
- [ ] Do not claim a recovered historical final answer.
- [ ] Keep AI Agents as the main narrative and BSC Testnet as the end-to-end scope.
- [ ] Review the recording once for readable evidence, audible narration, and a 4–5 minute duration.
