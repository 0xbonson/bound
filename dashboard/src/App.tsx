import { useState } from "react";
import "./App.css";

type Scenario = "safe" | "corrupted";

const USER_SIGNER =
  "0x191a34ea60cbEa9496423D9e0cdF1943b0433D85";

const VENDOR =
  "0x32438de3179df205c63e8793a20ba6885762f537";

const MUTATED_RECIPIENT =
  "0x2222222222222222222222222222222222222222";

const AGENT_WALLET =
  "0x6fa2f4360a04c88d98f6a70d1dda9653d856ce90";

const TX_HASH =
  "0x611eb86dd76f5879873a07065429d7a999fbd046a15c3327cc4ecf99b55cb675";

const EXPLORER_URL =
  `https://testnet.bscscan.com/tx/${TX_HASH}`;

function shorten(value: string, start = 8, end = 6) {
  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="icon"
    >
      <path
        d="M5 12.5 9.2 17 19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="brand-mark-icon"
    >
      <path
        d="M12 3 19 6v5c0 4.6-2.8 8.1-7 10-4.2-1.9-7-5.4-7-10V6l7-3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 12 2.1 2.1 4.5-4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="arrow-icon"
    >
      <path
        d="M5 12h13m-4-4 4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="external-icon"
    >
      <path
        d="M14 5h5v5M19 5l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function App() {
  const [scenario, setScenario] =
    useState<Scenario>("safe");

  const corrupted =
    scenario === "corrupted";

  const proposedRecipient =
    corrupted
      ? MUTATED_RECIPIENT
      : VENDOR;

  return (
    <main className="app-shell">
      <div className="background-grid" />

      <nav className="nav">
        <div className="brand">
          <div className="brand-mark">
            <ShieldIcon />
          </div>

          <div>
            <div className="brand-name">
              BOUND
            </div>
            <div className="brand-subtitle">
              Context Integrity Firewall
            </div>
          </div>
        </div>

        <div className="nav-right">
          <div className="network-pill">
            <span className="network-dot" />
            BSC Testnet
          </div>

          <div className="version-pill">
            CORE v0.1
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="eyebrow">
          ONCHAIN AGENT SECURITY
        </div>

        <h1>
          Bind context
          <br />
          <span>to execution.</span>
        </h1>

        <p className="hero-copy">
          BOUND verifies that what an AI agent
          tries to sign still matches what the
          user authorized and what trusted
          upstream evidence actually said.
        </p>

        <div className="hero-proof">
          <span>
            EIP-712 mandate
          </span>

          <span className="hero-proof-divider">
            +
          </span>

          <span>
            signed evidence
          </span>

          <span className="hero-proof-divider">
            +
          </span>

          <span>
            exact transaction
          </span>
        </div>
      </section>

      <section className="demo">
        <div className="section-heading">
          <div>
            <div className="section-kicker">
              INTERACTIVE DEMO
            </div>

            <h2>
              Same agent. Different context.
            </h2>
          </div>

          <div className="scenario-switch">
            <button
              type="button"
              className={
                scenario === "safe"
                  ? "scenario-button active"
                  : "scenario-button"
              }
              onClick={() =>
                setScenario("safe")
              }
            >
              Safe flow
            </button>

            <button
              type="button"
              className={
                scenario === "corrupted"
                  ? "scenario-button danger-active"
                  : "scenario-button"
              }
              onClick={() =>
                setScenario("corrupted")
              }
            >
              Corrupt context
            </button>
          </div>
        </div>

        <div
          className={
            corrupted
              ? "scenario-banner danger"
              : "scenario-banner"
          }
        >
          <div className="scenario-banner-label">
            {corrupted
              ? "CONTROLLED CONTEXT MUTATION"
              : "NORMAL EXECUTION PATH"}
          </div>

          <div className="scenario-banner-text">
            {corrupted
              ? "The recipient visible to the model has been changed while the signed evidence remains untouched."
              : "The model-visible transaction context is consistent with the trusted signed evidence."}
          </div>
        </div>

        <div className="verification-grid">
          <article className="verification-card">
            <div className="card-number">
              01
            </div>

            <div className="card-top">
              <div>
                <div className="card-label">
                  USER MANDATE
                </div>
                <h3>
                  Authorization
                </h3>
              </div>

              <div className="status verified">
                <CheckIcon />
                VERIFIED
              </div>
            </div>

            <div className="card-body">
              <div className="data-row">
                <span>
                  Scheme
                </span>
                <strong>
                  EIP-712
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Signer
                </span>
                <strong
                  title={USER_SIGNER}
                >
                  {shorten(USER_SIGNER)}
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Resource
                </span>
                <strong>
                  bnb-market-report
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Maximum
                </span>
                <strong>
                  0.005 tBNB
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Chain
                </span>
                <strong>
                  97
                </strong>
              </div>
            </div>
          </article>

          <div className="flow-arrow">
            <ArrowIcon />
          </div>

          <article className="verification-card">
            <div className="card-number">
              02
            </div>

            <div className="card-top">
              <div>
                <div className="card-label">
                  TRUSTED TOOL
                </div>
                <h3>
                  Signed evidence
                </h3>
              </div>

              <div className="status verified">
                <CheckIcon />
                VERIFIED
              </div>
            </div>

            <div className="card-body">
              <div className="data-row">
                <span>
                  Signature
                </span>
                <strong>
                  Ed25519
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Source
                </span>
                <strong>
                  native-market-report-tool
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Recipient
                </span>
                <strong
                  title={VENDOR}
                >
                  {shorten(VENDOR)}
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Amount
                </span>
                <strong>
                  0.001 tBNB
                </strong>
              </div>
            </div>
          </article>

          <div className="flow-arrow">
            <ArrowIcon />
          </div>

          <article
            className={
              corrupted
                ? "verification-card proposal-card corrupted-card"
                : "verification-card proposal-card"
            }
          >
            <div className="card-number">
              03
            </div>

            <div className="card-top">
              <div>
                <div className="card-label">
                  GEMINI AGENT
                </div>
                <h3>
                  Transaction
                </h3>
              </div>

              <div
                className={
                  corrupted
                    ? "status mismatch"
                    : "status verified"
                }
              >
                {corrupted
                  ? "MISMATCH"
                  : (
                    <>
                      <CheckIcon />
                      MATCH
                    </>
                  )}
              </div>
            </div>

            <div className="card-body">
              {corrupted && (
                <div className="mutation-box">
                  <div>
                    MODEL-VISIBLE RECIPIENT
                  </div>

                  <strong>
                    {shorten(
                      MUTATED_RECIPIENT
                    )}
                  </strong>
                </div>
              )}

              <div className="data-row">
                <span>
                  Recipient
                </span>
                <strong
                  className={
                    corrupted
                      ? "danger-text"
                      : ""
                  }
                  title={
                    proposedRecipient
                  }
                >
                  {shorten(
                    proposedRecipient
                  )}
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Value
                </span>
                <strong>
                  0.001 tBNB
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Calldata
                </span>
                <strong>
                  0x
                </strong>
              </div>

              <div className="data-row">
                <span>
                  Chain
                </span>
                <strong>
                  97
                </strong>
              </div>
            </div>
          </article>
        </div>

        <div
          className={
            corrupted
              ? "decision-panel blocked"
              : "decision-panel allowed"
          }
        >
          <div className="decision-left">
            <div className="decision-overline">
              BOUND DECISION
            </div>

            <div className="decision-title-row">
              <div
                className={
                  corrupted
                    ? "decision-symbol blocked-symbol"
                    : "decision-symbol"
                }
              >
                {corrupted
                  ? "×"
                  : "✓"}
              </div>

              <div>
                <div className="decision-title">
                  {corrupted
                    ? "BLOCK"
                    : "ALLOW"}
                </div>

                <div className="decision-reason">
                  {corrupted
                    ? "RECIPIENT_PROVENANCE_BREAK"
                    : "PROVENANCE_VERIFIED"}
                </div>
              </div>
            </div>
          </div>

          <div className="decision-explanation">
            {corrupted ? (
              <>
                <p>
                  The proposed recipient does
                  not match the recipient in
                  signed evidence.
                </p>

                <div className="comparison">
                  <div>
                    <span>
                      Expected
                    </span>
                    <code>
                      {shorten(
                        VENDOR,
                        10,
                        8
                      )}
                    </code>
                  </div>

                  <div>
                    <span>
                      Actual
                    </span>
                    <code className="danger-text">
                      {shorten(
                        MUTATED_RECIPIENT,
                        10,
                        8
                      )}
                    </code>
                  </div>
                </div>
              </>
            ) : (
              <p>
                Transaction-critical fields
                match both the user mandate and
                the signed upstream evidence.
              </p>
            )}
          </div>

          <div className="decision-result">
            <div className="decision-result-row">
              <span>
                Signer executed
              </span>
              <strong>
                {corrupted
                  ? "NO"
                  : "YES"}
              </strong>
            </div>

            <div className="decision-result-row">
              <span>
                Transaction
              </span>
              <strong>
                {corrupted
                  ? "NONE"
                  : "CONFIRMED"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-section">
        <div className="section-heading compact-heading">
          <div>
            <div className="section-kicker">
              RECORDED ONCHAIN PROOF
            </div>

            <h2>
              The valid path really executed.
            </h2>
          </div>

          <div className="proof-note">
            BNB Smart Chain Testnet
          </div>
        </div>

        <div className="proof-grid">
          <div className="proof-primary">
            <div className="proof-status">
              <span className="proof-status-dot" />
              CONFIRMED
            </div>

            <div className="proof-amount">
              0.001
              <span>
                tBNB
              </span>
            </div>

            <p>
              Exact transaction verified by
              BOUND, signed by the dedicated
              agent wallet, broadcast, and read
              back from chain.
            </p>

            <a
              href={EXPLORER_URL}
              target="_blank"
              rel="noreferrer"
              className="explorer-link"
            >
              View on BscScan
              <ExternalIcon />
            </a>
          </div>

          <div className="proof-details">
            <div className="proof-row">
              <span>
                Transaction
              </span>

              <code title={TX_HASH}>
                {shorten(
                  TX_HASH,
                  14,
                  10
                )}
              </code>
            </div>

            <div className="proof-row">
              <span>
                From
              </span>

              <code title={AGENT_WALLET}>
                {shorten(
                  AGENT_WALLET,
                  12,
                  8
                )}
              </code>
            </div>

            <div className="proof-row">
              <span>
                To
              </span>

              <code title={VENDOR}>
                {shorten(
                  VENDOR,
                  12,
                  8
                )}
              </code>
            </div>

            <div className="proof-row">
              <span>
                Value
              </span>

              <code>
                1000000000000000 wei
              </code>
            </div>

            <div className="proof-row">
              <span>
                Input
              </span>

              <code>
                0x
              </code>
            </div>

            <div className="proof-row">
              <span>
                Receipt
              </span>

              <strong className="success-text">
                SUCCESS
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="architecture">
        <div className="section-kicker">
          SECURITY BOUNDARY
        </div>

        <h2>
          Three facts must agree.
        </h2>

        <div className="architecture-flow">
          <div className="architecture-node">
            <div className="architecture-index">
              A
            </div>
            <strong>
              What the user authorized
            </strong>
            <span>
              EIP-712 mandate
            </span>
          </div>

          <div className="architecture-connector">
            +
          </div>

          <div className="architecture-node">
            <div className="architecture-index">
              B
            </div>
            <strong>
              What the tool attested
            </strong>
            <span>
              Ed25519 evidence
            </span>
          </div>

          <div className="architecture-connector">
            +
          </div>

          <div className="architecture-node">
            <div className="architecture-index">
              C
            </div>
            <strong>
              What the agent submits
            </strong>
            <span>
              Exact EVM transaction
            </span>
          </div>

          <div className="architecture-connector equals">
            =
          </div>

          <div className="architecture-node bound-node">
            <div className="architecture-index">
              B
            </div>
            <strong>
              BOUND
            </strong>
            <span>
              Allow or block
            </span>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-brand">
          <ShieldIcon />
          BOUND
        </div>

        <p>
          Prototype · BSC Testnet ·
          Context integrity, not global
          transaction safety.
        </p>
      </footer>
    </main>
  );
}

export default App;
