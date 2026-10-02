import { useState } from "react";
import "./App.css";

type Scenario =
  | "normal"
  | "corrupted";

const USER_SIGNER =
  "0x191a34ea60cbEa9496423D9e0cdF1943b0433D85";

const AGENT_WALLET =
  "0x6fa2f4360a04c88d98F6A70D1Dda9653D856ce90";

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
  front = 9,
  back = 7,
) {
  if (
    value.length <=
    front + back + 1
  ) {
    return value;
  }

  return `${value.slice(
    0,
    front,
  )}…${value.slice(-back)}`;
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
        strokeWidth="1.55"
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
        d="M11.7 4H16v4.3M16 4l-7.1 7.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      <path
        d="M14.6 10.7v4a1.3 1.3 0 0 1-1.3 1.3h-8A1.3 1.3 0 0 1 4 14.7v-8a1.3 1.3 0 0 1 1.3-1.3h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="status-icon"
    >
      <path
        d="m4.8 10.1 3.1 3.2 7.3-7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="status-icon"
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

function App() {
  const [
    scenario,
    setScenario,
  ] =
    useState<Scenario>(
      "normal",
    );

  const corrupted =
    scenario ===
    "corrupted";

  const proposedRecipient =
    corrupted
      ? CORRUPTED_RECIPIENT
      : TRUSTED_RECIPIENT;

  return (
    <div className="page">
      <header className="header">
        <a
          href="#top"
          className="brand"
          aria-label="BOUND"
        >
          <span className="brand-mark">
            B
          </span>

          <span className="brand-name">
            BOUND
          </span>
        </a>

        <nav
          className="nav"
          aria-label="Primary navigation"
        >
          <a href="#case">
            The case
          </a>

          <a href="#verifier">
            Verifier
          </a>

          <a href="#record">
            Onchain record
          </a>
        </nav>

        <div className="environment">
          BSC Testnet
        </div>
      </header>

      <main id="top">
        <section className="intro">
          <div className="intro-main">
            <p className="intro-label">
              Context integrity before
              signing
            </p>

            <h1>
              Verify the transaction before
              the agent signs it.
            </h1>

            <p className="intro-description">
              BOUND checks whether an
              autonomous agent’s transaction
              still agrees with the user
              authorization and signed
              upstream evidence.
            </p>

            <div className="intro-actions">
              <a
                href="#verifier"
                className="primary-action"
              >
                Open the verifier
                <ArrowIcon />
              </a>

              <a
                href="#record"
                className="text-action"
              >
                View testnet record
              </a>
            </div>
          </div>

          <aside className="intro-record">
            <div className="record-heading">
              <div>
                <span>
                  Pre-sign review
                </span>

                <strong>
                  BNB market report
                </strong>
              </div>

              <div className="record-state">
                cleared
              </div>
            </div>

            <div className="record-fields">
              <div className="record-field">
                <span>
                  User limit
                </span>

                <strong>
                  0.005 tBNB
                </strong>
              </div>

              <div className="record-field">
                <span>
                  Requested
                </span>

                <strong>
                  0.001 tBNB
                </strong>
              </div>

              <div className="record-field">
                <span>
                  Network
                </span>

                <strong>
                  BSC Testnet
                </strong>
              </div>
            </div>

            <div className="record-checks">
              <div>
                <span className="check-dot">
                  <CheckIcon />
                </span>

                <p>
                  <strong>
                    User mandate
                  </strong>

                  <span>
                    Signature verified
                  </span>
                </p>
              </div>

              <div>
                <span className="check-dot">
                  <CheckIcon />
                </span>

                <p>
                  <strong>
                    Trusted quote
                  </strong>

                  <span>
                    Source verified
                  </span>
                </p>
              </div>

              <div>
                <span className="check-dot">
                  <CheckIcon />
                </span>

                <p>
                  <strong>
                    Agent transaction
                  </strong>

                  <span>
                    Critical fields match
                  </span>
                </p>
              </div>
            </div>

            <div className="record-decision">
              <span>
                Eligible to reach signer
              </span>

              <strong>
                ALLOW
              </strong>
            </div>
          </aside>
        </section>

        <section
          className="case"
          id="case"
        >
          <div className="section-heading">
            <span className="section-index">
              01
            </span>

            <div>
              <p>
                The case
              </p>

              <h2>
                The amount can stay valid
                while the destination changes.
              </h2>
            </div>
          </div>

          <div className="case-body">
            <div className="case-copy">
              <p>
                The trusted tool returns a
                legitimate payment quote.
                Somewhere between that tool
                output and the transaction
                builder, the recipient visible
                to the model changes.
              </p>

              <p>
                A simple spending limit still
                sees an allowed amount. BOUND
                verifies where that amount is
                actually being sent.
              </p>
            </div>

            <div className="binding-example">
              <div className="binding-column">
                <span className="binding-label">
                  Signed evidence
                </span>

                <strong>
                  Vendor recipient
                </strong>

                <span
                  className="binding-address"
                  title={
                    TRUSTED_RECIPIENT
                  }
                >
                  {shorten(
                    TRUSTED_RECIPIENT,
                    13,
                    9,
                  )}
                </span>

                <small>
                  0.001 tBNB · chain 97
                </small>
              </div>

              <div className="binding-center">
                <span>
                  bound
                </span>

                <div className="binding-line">
                  <i />
                </div>

                <strong>
                  recipient differs
                </strong>
              </div>

              <div className="binding-column altered-column">
                <span className="binding-label">
                  Agent proposal
                </span>

                <strong>
                  Proposed recipient
                </strong>

                <span
                  className="binding-address altered-address"
                  title={
                    CORRUPTED_RECIPIENT
                  }
                >
                  {shorten(
                    CORRUPTED_RECIPIENT,
                    13,
                    9,
                  )}
                </span>

                <small>
                  0.001 tBNB · chain 97
                </small>
              </div>

              <div className="binding-outcome">
                <span>
                  Recipient mismatch
                </span>

                <strong>
                  BLOCK
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section
          className="verifier"
          id="verifier"
        >
          <div className="section-heading verifier-heading">
            <span className="section-index">
              02
            </span>

            <div>
              <p>
                Verifier
              </p>

              <h2>
                Review the exact transaction
                that reaches the signing
                boundary.
              </h2>
            </div>

            <div className="heading-note">
              Scenario viewer. Browser
              broadcast is disabled.
            </div>
          </div>

          <div className="review-sheet">
            <div className="sheet-header">
              <div>
                <strong>
                  Transaction review
                </strong>

                <span>
                  BNB market report
                </span>
              </div>

              <div
                className="scenario-selector"
                role="group"
                aria-label="Scenario"
              >
                <button
                  type="button"
                  className={
                    !corrupted
                      ? "scenario-button selected"
                      : "scenario-button"
                  }
                  onClick={() =>
                    setScenario(
                      "normal",
                    )
                  }
                >
                  Normal
                </button>

                <button
                  type="button"
                  className={
                    corrupted
                      ? "scenario-button selected corrupted-button"
                      : "scenario-button"
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

            <div className="sheet-body">
              <div className="sheet-context">
                <div className="sheet-column-label">
                  Context
                </div>

                <div className="context-record">
                  <div className="context-record-heading">
                    <strong>
                      User authorization
                    </strong>

                    <span className="quiet-valid">
                      verified
                    </span>
                  </div>

                  <div className="context-pairs">
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
                        Spend limit
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
                        Signature
                      </span>

                      <strong>
                        EIP-712
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="context-record">
                  <div className="context-record-heading">
                    <strong>
                      Trusted quote
                    </strong>

                    <span className="quiet-valid">
                      verified
                    </span>
                  </div>

                  <div className="context-pairs">
                    <div className="pair-wide">
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
                          15,
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
                      ? "context-record proposal-record proposal-mismatch"
                      : "context-record proposal-record"
                  }
                >
                  <div className="context-record-heading">
                    <strong>
                      Agent proposal
                    </strong>

                    <span
                      className={
                        corrupted
                          ? "quiet-error"
                          : "quiet-valid"
                      }
                    >
                      {corrupted
                        ? "mismatch"
                        : "matches"}
                    </span>
                  </div>

                  <div className="context-pairs">
                    <div className="pair-wide">
                      <span>
                        Recipient
                      </span>

                      <strong
                        className={
                          corrupted
                            ? "error-text"
                            : ""
                        }
                        title={
                          proposedRecipient
                        }
                      >
                        {shorten(
                          proposedRecipient,
                          15,
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

              <div className="sheet-verification">
                <div className="sheet-column-label">
                  Verification
                </div>

                <div className="verification-table">
                  <div className="verification-line">
                    <span>
                      User signer
                    </span>

                    <strong className="verified-result">
                      <CheckIcon />
                      valid
                    </strong>
                  </div>

                  <div className="verification-line">
                    <span>
                      Resource
                    </span>

                    <strong className="verified-result">
                      <CheckIcon />
                      match
                    </strong>
                  </div>

                  <div className="verification-line">
                    <span>
                      Network
                    </span>

                    <strong className="verified-result">
                      <CheckIcon />
                      match
                    </strong>
                  </div>

                  <div className="verification-line">
                    <span>
                      Amount
                    </span>

                    <strong className="verified-result">
                      <CheckIcon />
                      match
                    </strong>
                  </div>

                  <div className="verification-line">
                    <span>
                      Recipient
                    </span>

                    <strong
                      className={
                        corrupted
                          ? "failed-result"
                          : "verified-result"
                      }
                    >
                      {corrupted ? (
                        <>
                          <CrossIcon />
                          mismatch
                        </>
                      ) : (
                        <>
                          <CheckIcon />
                          match
                        </>
                      )}
                    </strong>
                  </div>
                </div>

                <div
                  className={
                    corrupted
                      ? "decision decision-block"
                      : "decision decision-allow"
                  }
                >
                  <span>
                    Decision
                  </span>

                  <strong>
                    {corrupted
                      ? "BLOCK"
                      : "ALLOW"}
                  </strong>

                  <small>
                    {corrupted
                      ? "RECIPIENT_PROVENANCE_BREAK"
                      : "PROVENANCE_VERIFIED"}
                  </small>

                  <p>
                    {corrupted
                      ? "The recipient in the agent transaction differs from the recipient in the signed evidence. The signing executor is not invoked."
                      : "Transaction-critical fields agree with the user authorization and signed evidence. The transaction is eligible to reach the signer."}
                  </p>
                </div>

                <div className="execution-table">
                  <div>
                    <span>
                      Signer
                    </span>

                    <strong>
                      {corrupted
                        ? "not invoked"
                        : "eligible"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Transaction
                    </span>

                    <strong>
                      {corrupted
                        ? "none"
                        : "ready"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="sheet-footer">
              <span>
                User mandate
              </span>

              <i />

              <span>
                Tool evidence
              </span>

              <i />

              <span>
                Agent transaction
              </span>

              <i />

              <strong>
                BOUND
              </strong>

              <i />

              <span>
                Signer
              </span>
            </div>
          </div>
        </section>

        <section
          className="onchain"
          id="record"
        >
          <div className="section-heading">
            <span className="section-index">
              03
            </span>

            <div>
              <p>
                Onchain record
              </p>

              <h2>
                A verified transaction was
                executed on BSC Testnet.
              </h2>
            </div>
          </div>

          <div className="onchain-body">
            <div className="receipt-summary">
              <span className="receipt-status">
                confirmed
              </span>

              <div className="receipt-amount">
                0.001
                <span>
                  tBNB
                </span>
              </div>

              <p>
                The transaction was checked,
                signed by the dedicated agent
                wallet, broadcast, confirmed,
                and read back from chain.
              </p>

              <a
                href={EXPLORER_URL}
                target="_blank"
                rel="noreferrer"
              >
                Open BscScan
                <ExternalIcon />
              </a>
            </div>

            <div className="receipt-record">
              <div>
                <span>
                  Network
                </span>

                <strong>
                  BNB Smart Chain Testnet
                </strong>
              </div>

              <div>
                <span>
                  Status
                </span>

                <strong className="positive">
                  success
                </strong>
              </div>

              <div>
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
                    13,
                    9,
                  )}
                </strong>
              </div>

              <div>
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
                    13,
                    9,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Transaction
                </span>

                <strong
                  title={TX_HASH}
                >
                  {shorten(
                    TX_HASH,
                    15,
                    11,
                  )}
                </strong>
              </div>

              <div>
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
          <div className="section-heading scope-heading">
            <span className="section-index">
              04
            </span>

            <div>
              <p>
                Current scope
              </p>

              <h2>
                What BOUND verifies today.
              </h2>
            </div>
          </div>

          <div className="scope-table">
            <div className="scope-row">
              <strong>
                User authorization
              </strong>

              <p>
                EIP-712 signature checked
                against the trusted user
                signer.
              </p>

              <span className="scope-done">
                implemented
              </span>
            </div>

            <div className="scope-row">
              <strong>
                Tool provenance
              </strong>

              <p>
                Ed25519 evidence checked
                against a pinned source key.
              </p>

              <span className="scope-done">
                implemented
              </span>
            </div>

            <div className="scope-row">
              <strong>
                Transaction binding
              </strong>

              <p>
                Chain, recipient, amount and
                calldata verified before
                signing.
              </p>

              <span className="scope-done">
                implemented
              </span>
            </div>

            <div className="scope-row">
              <strong>
                Replay control
              </strong>

              <p>
                A signed evidence item can be
                consumed only once by the
                local execution gate.
              </p>

              <span className="scope-done">
                implemented
              </span>
            </div>

            <div className="scope-row">
              <strong>
                Global safety
              </strong>

              <p>
                Scam detection, tool honesty,
                and universal intent inference
                are outside this prototype.
              </p>

              <span className="scope-limit">
                not claimed
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>
          <strong>
            BOUND
          </strong>

          <span>
            Context integrity before
            execution.
          </span>
        </div>

        <span>
          Prototype · BSC Testnet
        </span>
      </footer>
    </div>
  );
}

export default App;
