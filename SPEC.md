# BOUND v0.1

## Thesis

BOUND is a signing firewall for autonomous onchain AI agents.

It verifies whether transaction-critical fields are supported by the user authorization and tool evidence that caused the agent to construct the transaction.

BOUND is not a scam detector.
BOUND does not claim to stop all prompt injection.
BOUND does not claim an MCP server is honest.
BOUND does not use an LLM to authorize transactions.

## Core invariant

An AI agent must not sign a transaction whose critical fields cannot be traced back to its authorization and evidence.

## MVP

User:

"Buy a BNB market report for at most 1 TESTUSD."

Tool evidence:

resourceId = bnb-market-report
recipient = 0xA
amount = 0.25 TESTUSD
chainId = BSC Testnet

Normal proposed transaction:

recipient = 0xA
amount = 0.25 TESTUSD

BOUND => ALLOW

Poisoned proposed transaction:

recipient = 0xB
amount = 0.25 TESTUSD

BOUND => BLOCK

The poisoned transaction must never be signed.

## Objects

BOUND compares three independent objects:

1. Authorization
2. Evidence
3. ProposedTransaction

## Verified fields

- chainId
- token
- recipient
- amount
- resourceId
- evidenceId

## Decisions

ALLOW
BLOCK
NEEDS_REAUTHORIZATION

## AI role

The AI may:
- understand a task
- plan
- call tools
- propose a transaction

The AI does not make the final authorization decision.

BOUND authorization is deterministic.

## Blockchain role

BNB Smart Chain Testnet is the real execution layer.

ALLOW must eventually produce a real testnet transaction.

BLOCK must produce no transaction.

## Non-goals

- no escrow
- no marketplace
- no reputation score
- no tokenomics
- no DAO
- no generic scam score
- no fake metrics
- no fake blockchain activity

## Acceptance criteria

The MVP is real only if:

1. A real agent receives a natural-language task.
2. The agent calls a real tool.
3. Tool output is captured as evidence.
4. The agent proposes a BSC transaction.
5. BOUND verifies it independently.
6. Valid proposal => ALLOW.
7. Manipulated proposal => BLOCK.
8. BLOCK happens before signing.
9. Blocked flow creates no transaction.
10. Allowed flow creates a real BSC Testnet transaction.

## Product direction

AI Agent
→ Tool / MCP
→ Transaction proposal
→ BOUND
→ Wallet signer
→ BNB Smart Chain
