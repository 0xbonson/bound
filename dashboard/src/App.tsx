import { useState } from "react";
import "./App.css";

type Scenario = "safe" | "corrupted";

const USER_SIGNER =
  "0x191a34ea60cbEa9496423D9e0cdF1943b0433D85";

const AGENT_WALLET =
  "0x6fa2f4360a04c88d98f6a70d1dda9653d856ce90";

const TRUSTED_RECIPIENT =
  "0x32438de3179df205c63e8793a20ba6885762f537";

const CORRUPTED_RECIPIENT =
  "0x2222222222222222222222222222222222222222";

const TX_HASH =
  "0x611eb86dd76f5879873a07065429d7a999fbd046a15c3327cc4ecf99b55cb675";

const EXPLORER_URL =
  `https://testnet.bscscan.com/tx/${TX_HASH}`;

function shorten(
  value: string,
  front = 8,
  back = 6,
) {
  return `${value.slice(0, front)}…${value.slice(-back)}`;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="icon"
    >
      <path
        d="m4.7 10.2 3.1 3.2 7.5-7.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="icon"
    >
      <path
        d="m6 6 8 8M14 6l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="icon"
    >
      <path
        d="M4 10h11m-3.5-3.5L15 10l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="icon"
    >
      <path
        d="M11.5 4H16v4.5M16 4l-7.2 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14.7 10.5v4.2A1.3 1.3 0 0 1 13.4 16H5.3A1.3 1.3 0 0 1 4 14.7V6.6a1.3 1.3 0 0 1 1.3-1.3h4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
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
      ? CORRUPTED_RECIPIENT
      : TRUSTED_RECIPIENT;

  return (
    <div className="page">
      <header className="header">
        <a
          className="brand"
          href="#top"
        >
          <span className="brand-symbol">
            B
          </span>

          <span>
            BOUND
          </span>
        </a>

        <nav className="navigation">
          <a href="#product">
            Product
          </a>

          <a href="#how">
            How it works
          </a>

          <a href="#proof">
            Verification proof
          </a>
        </nav>

        <div className="header-status">
          BSC Testnet
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="overline">
              Context integrity for
              autonomous transactions
            </div>

            <h1>
              Keep the transaction aligned
              with the evidence.
            </h1>

            <p className="hero-description">
              BOUND verifies the user’s
              authorization, trusted upstream
              evidence, and the exact
              transaction an AI agent submits
              before signing is allowed.
            </p>

            <div className="hero-actions">
              <a
                href="#product"
                className="primary-button"
              >
                Explore the verifier
                <ArrowIcon />
              </a>

              <a
                href="#proof"
                className="secondary-button"
              >
                View testnet proof
              </a>
            </div>

            <p className="hero-note">
              Prototype environment · BNB
              Smart Chain Testnet
            </p>
          </div>

          <div className="hero-review">
            <div className="review-card">
              <div className="review-card-header">
                <div>
                  <span className="eyebrow">
                    PRE-SIGN REVIEW
                  </span>

                  <h2>
                    Transaction cleared
                  </h2>
                </div>

                <div className="decision-badge success-badge">
                  Approved
                </div>
              </div>

              <div className="review-summary">
                <div>
                  <span>
                    Purchase
                  </span>

                  <strong>
                    BNB market report
                  </strong>
                </div>

                <div>
                  <span>
                    Amount
                  </span>

                  <strong>
                    0.001 tBNB
                  </strong>
                </div>

                <div>
                  <span>
                    Network
                  </span>

                  <strong>
                    BSC Testnet
                  </strong>
                </div>
              </div>

              <div className="review-checks">
                <div className="review-check">
                  <div className="review-check-icon">
                    <CheckIcon />
                  </div>

                  <div>
                    <strong>
                      User authorization
                    </strong>

                    <span>
                      EIP-712 mandate verified
                    </span>
                  </div>
                </div>

                <div className="review-check">
                  <div className="review-check-icon">
                    <CheckIcon />
                  </div>

                  <div>
                    <strong>
                      Trusted evidence
                    </strong>

                    <span>
                      Tool signature verified
                    </span>
                  </div>
                </div>

                <div className="review-check">
                  <div className="review-check-icon">
                    <CheckIcon />
                  </div>

                  <div>
                    <strong>
                      Transaction details
                    </strong>

                    <span>
                      Recipient and amount match
                    </span>
                  </div>
                </div>
              </div>

              <div className="review-footer">
                <span>
                  Eligible to reach signer
                </span>

                <strong>
                  ALLOW
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className="principles">
          <div className="principle">
            <span className="principle-index">
              01
            </span>

            <div>
              <strong>
                User-bound
              </strong>

              <p>
                The spending mandate comes
                from a verified user signer,
                not from the agent itself.
              </p>
            </div>
          </div>

          <div className="principle">
            <span className="principle-index">
              02
            </span>

            <div>
              <strong>
                Evidence-bound
              </strong>

              <p>
                Transaction-critical values
                are checked against signed
                upstream evidence.
              </p>
            </div>
          </div>

          <div className="principle">
            <span className="principle-index">
              03
            </span>

            <div>
              <strong>
                Signer-bound
              </strong>

              <p>
                Verification runs again at
                the final boundary before the
                signing key is accessed.
              </p>
            </div>
          </div>
        </section>

        <section className="problem">
          <div className="section-heading">
            <span className="section-label">
              The problem
            </span>

            <h2>
              A correct spending limit can
              still authorize the wrong
              destination.
            </h2>
          </div>

          <div className="problem-layout">
            <div className="problem-copy">
              <p>
                An autonomous agent may receive
                a legitimate payment quote,
                but the context used to build
                its transaction can change
                before signing.
              </p>

              <p>
                BOUND does not ask the model
                to judge whether its own
                transaction is trustworthy.
                It compares the transaction
                against independently trusted
                context.
              </p>
            </div>

            <div className="difference-card">
              <div className="difference-row">
                <div>
                  <span>
                    Trusted evidence
                  </span>

                  <strong>
                    Vendor recipient
                  </strong>
                </div>

                <div className="address">
                  {shorten(
                    TRUSTED_RECIPIENT,
                    12,
                    8,
                  )}
                </div>
              </div>

              <div className="difference-divider">
                context changed
              </div>

              <div className="difference-row altered">
                <div>
                  <span>
                    Agent context
                  </span>

                  <strong>
                    Proposed recipient
                  </strong>
                </div>

                <div className="address">
                  {shorten(
                    CORRUPTED_RECIPIENT,
                    12,
                    8,
                  )}
                </div>
              </div>

              <div className="difference-result">
                <div>
                  <CloseIcon />
                </div>

                <span>
                  Recipient mismatch
                </span>

                <strong>
                  Execution blocked
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section
          className="product"
          id="product"
        >
          <div className="product-heading">
            <div>
              <span className="section-label">
                Product
              </span>

              <h2>
                Review what the agent is
                actually about to sign.
              </h2>
            </div>

            <p>
              Switch between the normal and
              corrupted scenarios to inspect
              how the same payment request is
              evaluated.
            </p>
          </div>

          <div className="workspace">
            <div className="workspace-header">
              <div className="workspace-title">
                <strong>
                  Transaction review
                </strong>

                <span>
                  Scenario preview
                </span>
              </div>

              <div className="scenario-tabs">
                <button
                  type="button"
                  className={
                    !corrupted
                      ? "scenario-tab active"
                      : "scenario-tab"
                  }
                  onClick={() =>
                    setScenario("safe")
                  }
                >
                  Normal
                </button>

                <button
                  type="button"
                  className={
                    corrupted
                      ? "scenario-tab active danger-tab"
                      : "scenario-tab"
                  }
                  onClick={() =>
                    setScenario(
                      "corrupted",
                    )
                  }
                >
                  Corrupted
                </button>
              </div>
            </div>

            <div className="workspace-body">
              <div className="transaction-overview">
                <div className="panel-title">
                  Transaction context
                </div>

                <div className="context-section">
                  <div className="context-heading">
                    User mandate

                    <span className="verified-label">
                      verified
                    </span>
                  </div>

                  <div className="context-grid">
                    <div>
                      <span>
                        Resource
                      </span>

                      <strong>
                        BNB market report
                      </strong>
                    </div>

                    <div>
                      <span>
                        Maximum
                      </span>

                      <strong>
                        0.005 tBNB
                      </strong>
                    </div>

                    <div>
                      <span>
                        Network
                      </span>

                      <strong>
                        BSC Testnet
                      </strong>
                    </div>

                    <div>
                      <span>
                        Authorization
                      </span>

                      <strong>
                        EIP-712
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="context-section">
                  <div className="context-heading">
                    Trusted quote

                    <span className="verified-label">
                      verified
                    </span>
                  </div>

                  <div className="context-grid">
                    <div className="wide-context">
                      <span>
                        Recipient
                      </span>

                      <strong
                        title={
                          TRUSTED_RECIPIENT
                        }
                      >
                        {shorten(
                          TRUSTED_RECIPIENT,
                          14,
                          10,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Amount
                      </span>

                      <strong>
                        0.001 tBNB
                      </strong>
                    </div>
                  </div>
                </div>

                <div
                  className={
                    corrupted
                      ? "context-section agent-context mismatch-context"
                      : "context-section agent-context"
                  }
                >
                  <div className="context-heading">
                    Agent proposal

                    <span
                      className={
                        corrupted
                          ? "mismatch-label"
                          : "verified-label"
                      }
                    >
                      {corrupted
                        ? "mismatch"
                        : "matches"}
                    </span>
                  </div>

                  <div className="context-grid">
                    <div className="wide-context">
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
                          proposedRecipient,
                          14,
                          10,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Amount
                      </span>

                      <strong>
                        0.001 tBNB
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="verification-panel">
                <div className="panel-title">
                  Verification
                </div>

                <div className="verification-list">
                  <div className="verification-row">
                    <span>
                      User signer
                    </span>

                    <strong className="pass">
                      <CheckIcon />
                      Valid
                    </strong>
                  </div>

                  <div className="verification-row">
                    <span>
                      Resource
                    </span>

                    <strong className="pass">
                      <CheckIcon />
                      Match
                    </strong>
                  </div>

                  <div className="verification-row">
                    <span>
                      Network
                    </span>

                    <strong className="pass">
                      <CheckIcon />
                      Match
                    </strong>
                  </div>

                  <div className="verification-row">
                    <span>
                      Amount
                    </span>

                    <strong className="pass">
                      <CheckIcon />
                      Match
                    </strong>
                  </div>

                  <div className="verification-row">
                    <span>
                      Recipient
                    </span>

                    <strong
                      className={
                        corrupted
                          ? "fail"
                          : "pass"
                      }
                    >
                      {corrupted ? (
                        <>
                          <CloseIcon />
                          Mismatch
                        </>
                      ) : (
                        <>
                          <CheckIcon />
                          Match
                        </>
                      )}
                    </strong>
                  </div>
                </div>

                <div
                  className={
                    corrupted
                      ? "final-decision denied"
                      : "final-decision approved"
                  }
                >
                  <span>
                    Final decision
                  </span>

                  <strong>
                    {corrupted
                      ? "BLOCK"
                      : "ALLOW"}
                  </strong>

                  <p>
                    {corrupted
                      ? "The proposed recipient differs from the recipient in the signed quote. The signer is not invoked."
                      : "The transaction agrees with the user mandate and the signed quote. It may proceed to the signer."}
                  </p>
                </div>

                <div className="execution-summary">
                  <div>
                    <span>
                      Signer
                    </span>

                    <strong>
                      {corrupted
                        ? "Not invoked"
                        : "Eligible"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Result
                    </span>

                    <strong>
                      {corrupted
                        ? "No transaction"
                        : "Ready"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="workspace-note">
              Scenario interface only.
              Browser-side transaction
              broadcast is intentionally
              disabled.
            </div>
          </div>
        </section>

        <section
          className="how"
          id="how"
        >
          <div className="how-heading">
            <span className="section-label">
              How it works
            </span>

            <h2>
              One verification boundary,
              three independent inputs.
            </h2>
          </div>

          <div className="process">
            <div className="process-step">
              <div className="process-number">
                1
              </div>

              <div>
                <strong>
                  User authorization
                </strong>

                <p>
                  A time-bounded EIP-712
                  mandate defines what the
                  agent may purchase.
                </p>
              </div>
            </div>

            <div className="process-line" />

            <div className="process-step">
              <div className="process-number">
                2
              </div>

              <div>
                <strong>
                  Signed evidence
                </strong>

                <p>
                  The upstream tool signs the
                  recipient, amount, resource
                  and network.
                </p>
              </div>
            </div>

            <div className="process-line" />

            <div className="process-step">
              <div className="process-number">
                3
              </div>

              <div>
                <strong>
                  Agent transaction
                </strong>

                <p>
                  BOUND inspects the exact
                  fields submitted to the
                  signer.
                </p>
              </div>
            </div>

            <div className="process-line" />

            <div className="process-step final-step">
              <div className="process-number">
                4
              </div>

              <div>
                <strong>
                  Signer decision
                </strong>

                <p>
                  Only consistent context
                  reaches the signing key.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="proof"
          id="proof"
        >
          <div className="proof-heading">
            <div>
              <span className="section-label">
                Testnet proof
              </span>

              <h2>
                Verified end to end on BSC
                Testnet.
              </h2>
            </div>

            <p>
              A valid transaction was
              independently checked by BOUND,
              signed by the dedicated agent
              wallet, broadcast, confirmed,
              and read back from chain.
            </p>
          </div>

          <div className="proof-report">
            <div className="proof-highlight">
              <div className="confirmed-label">
                Confirmed
              </div>

              <div className="proof-amount">
                0.001
                <span>
                  tBNB
                </span>
              </div>

              <p>
                Native BSC Testnet transfer
                matching the signed evidence.
              </p>

              <a
                href={EXPLORER_URL}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
                <ExternalIcon />
              </a>
            </div>

            <div className="proof-details">
              <div className="proof-detail">
                <span>
                  Status
                </span>

                <strong className="proof-ok">
                  Success
                </strong>
              </div>

              <div className="proof-detail">
                <span>
                  Network
                </span>

                <strong>
                  BNB Smart Chain Testnet
                </strong>
              </div>

              <div className="proof-detail">
                <span>
                  Sender
                </span>

                <strong
                  title={
                    AGENT_WALLET
                  }
                >
                  {shorten(
                    AGENT_WALLET,
                    12,
                    8,
                  )}
                </strong>
              </div>

              <div className="proof-detail">
                <span>
                  Recipient
                </span>

                <strong
                  title={
                    TRUSTED_RECIPIENT
                  }
                >
                  {shorten(
                    TRUSTED_RECIPIENT,
                    12,
                    8,
                  )}
                </strong>
              </div>

              <div className="proof-detail">
                <span>
                  Transaction
                </span>

                <strong title={TX_HASH}>
                  {shorten(
                    TX_HASH,
                    14,
                    10,
                  )}
                </strong>
              </div>

              <div className="proof-detail">
                <span>
                  Confirmed value
                </span>

                <strong>
                  0.001 tBNB
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className="scope">
          <div className="scope-heading">
            <span className="section-label">
              Technical scope
            </span>

            <h2>
              Clear boundaries, not broad
              promises.
            </h2>
          </div>

          <div className="scope-list">
            <div className="scope-row">
              <div>
                User authorization
              </div>

              <p>
                EIP-712 signature verified
                against a trusted user signer.
              </p>

              <span className="scope-status">
                Implemented
              </span>
            </div>

            <div className="scope-row">
              <div>
                Tool provenance
              </div>

              <p>
                Ed25519 evidence verified
                against a pinned public key.
              </p>

              <span className="scope-status">
                Implemented
              </span>
            </div>

            <div className="scope-row">
              <div>
                Transaction binding
              </div>

              <p>
                Network, recipient, amount and
                calldata verified before
                signing.
              </p>

              <span className="scope-status">
                Implemented
              </span>
            </div>

            <div className="scope-row">
              <div>
                Replay protection
              </div>

              <p>
                Signed evidence can be
                consumed only once by the
                local execution gate.
              </p>

              <span className="scope-status">
                Implemented
              </span>
            </div>

            <div className="scope-row">
              <div>
                Global transaction safety
              </div>

              <p>
                Scam detection and universal
                intent inference are outside
                the current prototype.
              </p>

              <span className="scope-status muted-status">
                Not claimed
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <strong>
            BOUND
          </strong>

          <span>
            Context integrity before execution.
          </span>
        </div>

        <p>
          Research prototype · BSC Testnet
        </p>
      </footer>
    </div>
  );
}

export default App;
