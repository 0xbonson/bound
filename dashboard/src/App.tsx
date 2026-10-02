import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_BOUND_API_URL ??
  "http://127.0.0.1:8791";

const PROOF_HASH =
  "0x611eb86dd76f5879873a07065429d7a999fbd046a15c3327cc4ecf99b55cb675";

const MUTATED_RECIPIENT =
  "0x2222222222222222222222222222222222222222";

type Decision =
  | "ALLOW"
  | "BLOCK"
  | "NEEDS_REAUTHORIZATION";

type Finding = {
  code: string;
  message: string;
  expected?: string;
  actual?: string;
};

type Verification = {
  decision: Decision;
  evidenceId: string;
  findings: Finding[];
};

type ComparisonItem = {
  matches: boolean;
};

type VerificationResult = {
  sessionId: string;
  verification: Verification;
  comparison: {
    recipient: ComparisonItem & {
      expected: string;
      actual: string;
    };
    amount: ComparisonItem & {
      expectedWei: string;
      actualWei: string;
    };
    chain: ComparisonItem & {
      expected: number;
      actual: number;
    };
    calldata: ComparisonItem & {
      expected: string;
      actual: string;
    };
  };
  signerInvoked: boolean;
  broadcast: boolean;
};

type Session = {
  sessionId: string;
  createdAt: number;
  expiresAt: number;

  authorization: {
    signatureScheme: string;
    signer: string;
    authorizationId: string;
    resourceId: string;
    chainId: number;
    assetType: string;
    assetSymbol: string;
    maxAmountWei: string;
    maxAmountTbnb: string;
    trustedSourceId: string;
    validUntil: number;
  };

  evidence: {
    signatureScheme: string;
    evidenceId: string;
    sourceId: string;
    resourceId: string;
    chainId: number;
    assetType: string;
    assetSymbol: string;
    recipient: string;
    amountWei: string;
    amountTbnb: string;
    nonce: string;
    issuedAt: number;
    expiresAt: number;
  };

  transaction: {
    chainId: number;
    to: string;
    valueWei: string;
    data: string;
  };

  baselineVerification: Verification;
};

type ReplayResult = {
  sessionId: string;
  verification: Verification;
  firstGate: Verification;
  secondGate: Verification;
  signerInvoked: boolean;
  broadcast: boolean;
  note: string;
};

type OnchainProof = {
  network: string;
  chainId: number;
  hash: string;
  blockNumber: string | null;
  from: string;
  to: string | null;
  valueWei: string;
  valueTbnb: string;
  input: string;
  nonce: number;
  receiptStatus: string;
  gasUsed: string;
  transactionIndex: number;
};

type Candidate = {
  recipient: string;
  amountTbnb: string;
  chainId: string;
  calldata: string;
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

async function requestJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const payload = body as ApiErrorPayload | null;

    throw new Error(
      payload?.message ??
        payload?.error ??
        `BOUND API returned HTTP ${response.status}.`,
    );
  }

  return body as T;
}

function tbnbToWei(value: string): string {
  const normalized = value.trim();

  if (!/^\d+(\.\d*)?$/.test(normalized)) {
    throw new Error("Amount must be a non-negative decimal number.");
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");

  if (fractionPart.length > 18) {
    throw new Error("tBNB amount supports at most 18 decimal places.");
  }

  const paddedFraction = fractionPart.padEnd(18, "0");

  return (
    BigInt(wholePart || "0") * 10n ** 18n +
    BigInt(paddedFraction || "0")
  ).toString();
}

function shortHex(value: string, left = 8, right = 6) {
  if (value.length <= left + right + 3) {
    return value;
  }

  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function formatRemaining(milliseconds: number) {
  if (milliseconds <= 0) {
    return "expired";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ResultMark({
  ok,
}: {
  ok: boolean;
}) {
  return (
    <span className={`result-mark ${ok ? "pass" : "fail"}`}>
      {ok ? "✓" : "×"}
    </span>
  );
}

function App() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(
    null,
  );

  const [session, setSession] = useState<Session | null>(
    null,
  );

  const [candidate, setCandidate] = useState<Candidate>({
    recipient: "",
    amountTbnb: "",
    chainId: "",
    calldata: "0x",
  });

  const [verification, setVerification] =
    useState<VerificationResult | null>(null);

  const [replayResult, setReplayResult] =
    useState<ReplayResult | null>(null);

  const [proof, setProof] =
    useState<OnchainProof | null>(null);

  const [loadingSession, setLoadingSession] =
    useState(false);

  const [verifying, setVerifying] =
    useState(false);

  const [testingReplay, setTestingReplay] =
    useState(false);

  const [loadingProof, setLoadingProof] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [now, setNow] =
    useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        await requestJson("/api/health");
        setApiOnline(true);
      } catch {
        setApiOnline(false);
        return;
      }

      try {
        setLoadingSession(true);

        const nextSession =
          await requestJson<Session>("/api/session", {
            method: "POST",
          });

        applySession(nextSession);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to create BOUND session.",
        );
      } finally {
        setLoadingSession(false);
      }
    }

    void bootstrap();
  }, []);

  const remainingMs =
    session
      ? session.expiresAt - now
      : 0;

  const sessionExpired =
    Boolean(session) &&
    remainingMs <= 0;

  const flowState = useMemo(() => {
    if (verifying) {
      return "verifying";
    }

    if (!verification) {
      return "idle";
    }

    return verification.verification.decision === "ALLOW"
      ? "allow"
      : "block";
  }, [verification, verifying]);

  function applySession(nextSession: Session) {
    setSession(nextSession);

    setCandidate({
      recipient:
        nextSession.transaction.to,

      amountTbnb:
        nextSession.evidence.amountTbnb,

      chainId:
        String(
          nextSession.transaction.chainId,
        ),

      calldata:
        nextSession.transaction.data,
    });

    setVerification(null);
    setReplayResult(null);
    setError(null);
  }

  function updateCandidate(
    patch: Partial<Candidate>,
  ) {
    setCandidate((current) => ({
      ...current,
      ...patch,
    }));

    setVerification(null);
    setError(null);
  }

  async function createFreshSession() {
    try {
      setLoadingSession(true);
      setError(null);

      const nextSession =
        await requestJson<Session>("/api/session", {
          method: "POST",
        });

      applySession(nextSession);
      setApiOnline(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create a new session.",
      );
    } finally {
      setLoadingSession(false);
    }
  }

  function resetCandidate() {
    if (!session) {
      return;
    }

    setCandidate({
      recipient:
        session.transaction.to,

      amountTbnb:
        session.evidence.amountTbnb,

      chainId:
        String(
          session.transaction.chainId,
        ),

      calldata:
        session.transaction.data,
    });

    setVerification(null);
    setError(null);
  }

  function mutateRecipient() {
    updateCandidate({
      recipient:
        MUTATED_RECIPIENT,
    });
  }

  function mutateAmount() {
    updateCandidate({
      amountTbnb:
        "0.002",
    });
  }

  function mutateNetwork() {
    updateCandidate({
      chainId:
        candidate.chainId === "97"
          ? "56"
          : "97",
    });
  }

  function mutateCalldata() {
    updateCandidate({
      calldata:
        candidate.calldata === "0x"
          ? "0x1234"
          : "0x",
    });
  }

  async function verifyTransaction() {
    if (!session) {
      return;
    }

    try {
      setVerifying(true);
      setVerification(null);
      setError(null);

      const chainId =
        Number(candidate.chainId);

      if (
        !Number.isInteger(chainId) ||
        chainId < 0
      ) {
        throw new Error(
          "Chain ID must be a valid integer.",
        );
      }

      const valueWei =
        tbnbToWei(
          candidate.amountTbnb,
        );

      const result =
        await requestJson<VerificationResult>(
          "/api/verify",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                sessionId:
                  session.sessionId,

                transaction: {
                  chainId,

                  to:
                    candidate.recipient.trim(),

                  valueWei,

                  data:
                    candidate.calldata.trim(),
                },
              }),
          },
        );

      setVerification(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Verification failed.",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function testReplay() {
    if (!session) {
      return;
    }

    try {
      setTestingReplay(true);
      setReplayResult(null);
      setError(null);

      const result =
        await requestJson<ReplayResult>(
          "/api/replay-test",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                sessionId:
                  session.sessionId,

                transaction:
                  session.transaction,
              }),
          },
        );

      setReplayResult(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Replay test failed.",
      );
    } finally {
      setTestingReplay(false);
    }
  }

  async function fetchOnchainProof() {
    try {
      setLoadingProof(true);
      setError(null);

      const result =
        await requestJson<OnchainProof>(
          `/api/onchain/${PROOF_HASH}`,
        );

      setProof(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to read BSC Testnet.",
      );
    } finally {
      setLoadingProof(false);
    }
  }

  function scrollToWorkspace() {
    document
      .getElementById("workspace")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }

  const decision =
    verification?.verification.decision;

  const primaryFinding =
    verification?.verification.findings[0];

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#top"
        >
          <span className="brand-mark">
            B
          </span>

          <span>BOUND</span>
        </a>

        <div className="topbar-right">
          <span className="network-label">
            BSC TESTNET
          </span>

          <span
            className={`api-status ${
              apiOnline === true
                ? "online"
                : apiOnline === false
                  ? "offline"
                  : ""
            }`}
          >
            <span className="status-dot" />

            {apiOnline === null
              ? "Checking API"
              : apiOnline
                ? "BOUND API online"
                : "BOUND API offline"}
          </span>
        </div>
      </header>

      <main id="top">
        <section className="intro">
          <div className="intro-copy">
            <div className="eyebrow">
              CONTEXT INTEGRITY BEFORE SIGNING
            </div>

            <h1>
              Verify what the agent is
              about to sign.
            </h1>

            <p>
              Edit a transaction candidate,
              send it through the real BOUND
              verifier, and see whether it is
              still consistent with signed
              authorization and upstream
              evidence.
            </p>

            <div className="intro-actions">
              <button
                className="primary-button"
                onClick={scrollToWorkspace}
              >
                Open verifier
                <span>↓</span>
              </button>

              <button
                className="text-button"
                onClick={() => {
                  document
                    .getElementById(
                      "onchain-proof",
                    )
                    ?.scrollIntoView({
                      behavior: "smooth",
                    });
                }}
              >
                View onchain proof
              </button>
            </div>
          </div>

          <div
            className={`binding-map ${flowState}`}
          >
            <div className="binding-source">
              <span>User mandate</span>
              <strong>EIP-712</strong>
            </div>

            <div className="binding-source">
              <span>Tool evidence</span>
              <strong>Ed25519</strong>
            </div>

            <div className="binding-source">
              <span>
                Transaction candidate
              </span>
              <strong>Editable</strong>
            </div>

            <div className="binding-lines">
              <i />
              <i />
              <i />
            </div>

            <div className="bound-node">
              BOUND
            </div>

            <div className="signer-line" />

            <div className="signer-node">
              SIGNER
            </div>
          </div>
        </section>

        {error && (
          <div className="global-error">
            <strong>BOUND error</strong>
            <span>{error}</span>

            <button
              onClick={() =>
                setError(null)
              }
            >
              Dismiss
            </button>
          </div>
        )}

        <section
          className="workspace-section"
          id="workspace"
        >
          <div className="section-heading">
            <div>
              <div className="section-index">
                01 / VERIFIER
              </div>

              <h2>
                Transaction workspace
              </h2>
            </div>

            <div className="session-tools">
              {session && (
                <span
                  className={`session-life ${
                    sessionExpired
                      ? "expired"
                      : ""
                  }`}
                >
                  Session{" "}
                  {formatRemaining(
                    remainingMs,
                  )}
                </span>
              )}

              <button
                className="secondary-button"
                onClick={
                  createFreshSession
                }
                disabled={
                  loadingSession
                }
              >
                {loadingSession
                  ? "Creating…"
                  : "New session"}
              </button>
            </div>
          </div>

          <div className="attack-strip">
            <span className="attack-label">
              BREAK THIS TRANSACTION
            </span>

            <button
              onClick={mutateRecipient}
              disabled={!session}
            >
              Change recipient
            </button>

            <button
              onClick={mutateAmount}
              disabled={!session}
            >
              Change amount
            </button>

            <button
              onClick={mutateNetwork}
              disabled={!session}
            >
              Switch network
            </button>

            <button
              onClick={mutateCalldata}
              disabled={!session}
            >
              Attach calldata
            </button>

            <button
              onClick={resetCandidate}
              disabled={!session}
            >
              Reset
            </button>
          </div>

          <div className="workspace-grid">
            <article className="workspace-panel context-panel">
              <header className="panel-header">
                <div>
                  <span className="panel-kicker">
                    TRUSTED CONTEXT
                  </span>

                  <h3>
                    Signed reference
                  </h3>
                </div>

                <span className="verified-tag">
                  VERIFIED
                </span>
              </header>

              {!session ? (
                <div className="panel-loading">
                  {loadingSession
                    ? "Creating verification session…"
                    : "No active session."}
                </div>
              ) : (
                <div className="context-records">
                  <div className="context-block">
                    <span className="record-type">
                      USER AUTHORIZATION
                    </span>

                    <dl>
                      <div>
                        <dt>Scheme</dt>
                        <dd>
                          {
                            session
                              .authorization
                              .signatureScheme
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Maximum spend
                        </dt>
                        <dd>
                          {
                            session
                              .authorization
                              .maxAmountTbnb
                          }{" "}
                          tBNB
                        </dd>
                      </div>

                      <div>
                        <dt>Network</dt>
                        <dd>
                          Chain{" "}
                          {
                            session
                              .authorization
                              .chainId
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Signer</dt>
                        <dd
                          title={
                            session
                              .authorization
                              .signer
                          }
                        >
                          {shortHex(
                            session
                              .authorization
                              .signer,
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="context-block">
                    <span className="record-type">
                      SIGNED TOOL EVIDENCE
                    </span>

                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>
                          {
                            session
                              .evidence
                              .sourceId
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Amount</dt>
                        <dd>
                          {
                            session
                              .evidence
                              .amountTbnb
                          }{" "}
                          tBNB
                        </dd>
                      </div>

                      <div>
                        <dt>Recipient</dt>
                        <dd
                          title={
                            session
                              .evidence
                              .recipient
                          }
                        >
                          {shortHex(
                            session
                              .evidence
                              .recipient,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Evidence</dt>
                        <dd
                          title={
                            session
                              .evidence
                              .evidenceId
                          }
                        >
                          {shortHex(
                            session
                              .evidence
                              .evidenceId,
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </article>

            <article className="workspace-panel candidate-panel">
              <header className="panel-header">
                <div>
                  <span className="panel-kicker">
                    TRANSACTION CANDIDATE
                  </span>

                  <h3>
                    Edit before verification
                  </h3>
                </div>

                <span className="editable-tag">
                  EDITABLE
                </span>
              </header>

              <div className="field-stack">
                <label>
                  <span>Recipient</span>

                  <input
                    value={
                      candidate.recipient
                    }
                    onChange={(event) =>
                      updateCandidate({
                        recipient:
                          event.target
                            .value,
                      })
                    }
                    spellCheck={false}
                  />
                </label>

                <label>
                  <span>
                    Amount · tBNB
                  </span>

                  <input
                    value={
                      candidate.amountTbnb
                    }
                    onChange={(event) =>
                      updateCandidate({
                        amountTbnb:
                          event.target
                            .value,
                      })
                    }
                    inputMode="decimal"
                    spellCheck={false}
                  />
                </label>

                <div className="field-row">
                  <label>
                    <span>Chain ID</span>

                    <input
                      value={
                        candidate.chainId
                      }
                      onChange={(event) =>
                        updateCandidate({
                          chainId:
                            event.target
                              .value,
                        })
                      }
                      inputMode="numeric"
                    />
                  </label>

                  <label>
                    <span>Calldata</span>

                    <input
                      value={
                        candidate.calldata
                      }
                      onChange={(event) =>
                        updateCandidate({
                          calldata:
                            event.target
                              .value,
                        })
                      }
                      spellCheck={false}
                    />
                  </label>
                </div>
              </div>

              <button
                className="verify-button"
                onClick={
                  verifyTransaction
                }
                disabled={
                  !session ||
                  verifying ||
                  sessionExpired
                }
              >
                {verifying ? (
                  <>
                    <span className="spinner" />
                    BOUND evaluating
                  </>
                ) : (
                  <>
                    Verify transaction
                    <span>→</span>
                  </>
                )}
              </button>

              <p className="verify-note">
                Verification is live.
                Browser signing and broadcast
                remain disabled.
              </p>
            </article>

            <article
              className={`workspace-panel decision-panel ${
                decision
                  ? decision.toLowerCase()
                  : ""
              }`}
            >
              <header className="panel-header">
                <div>
                  <span className="panel-kicker">
                    BOUND DECISION
                  </span>

                  <h3>
                    Verification result
                  </h3>
                </div>
              </header>

              {verifying ? (
                <div className="evaluating-state">
                  <div className="evaluation-line">
                    <span />
                  </div>

                  <strong>
                    Evaluating candidate
                  </strong>

                  <p>
                    The transaction is being
                    checked against the active
                    authorization and signed
                    evidence.
                  </p>
                </div>
              ) : !verification ? (
                <div className="empty-decision">
                  <span>—</span>

                  <strong>
                    Not evaluated
                  </strong>

                  <p>
                    Edit the candidate or try
                    a failure preset, then run
                    verification.
                  </p>
                </div>
              ) : (
                <div className="decision-content">
                  <div className="checks">
                    <div>
                      <span>Recipient</span>
                      <ResultMark
                        ok={
                          verification
                            .comparison
                            .recipient
                            .matches
                        }
                      />
                    </div>

                    <div>
                      <span>Amount</span>
                      <ResultMark
                        ok={
                          verification
                            .comparison
                            .amount
                            .matches
                        }
                      />
                    </div>

                    <div>
                      <span>Network</span>
                      <ResultMark
                        ok={
                          verification
                            .comparison
                            .chain
                            .matches
                        }
                      />
                    </div>

                    <div>
                      <span>Calldata</span>
                      <ResultMark
                        ok={
                          verification
                            .comparison
                            .calldata
                            .matches
                        }
                      />
                    </div>
                  </div>

                  <div className="decision-block">
                    <span>
                      {
                        verification
                          .verification
                          .decision
                      }
                    </span>

                    <strong>
                      {primaryFinding?.code ??
                        "NO_FINDING"}
                    </strong>

                    <p>
                      {primaryFinding?.message ??
                        ""}
                    </p>
                  </div>

                  {verification
                    .comparison
                    .recipient
                    .matches === false && (
                    <div className="diff-block">
                      <div>
                        <span>Expected</span>
                        <code>
                          {shortHex(
                            verification
                              .comparison
                              .recipient
                              .expected,
                            12,
                            10,
                          )}
                        </code>
                      </div>

                      <div>
                        <span>Received</span>
                        <code>
                          {shortHex(
                            verification
                              .comparison
                              .recipient
                              .actual,
                            12,
                            10,
                          )}
                        </code>
                      </div>
                    </div>
                  )}

                  <div className="boundary-state">
                    <span>
                      Signer invoked
                    </span>

                    <strong>
                      {verification
                        .signerInvoked
                        ? "YES"
                        : "NO"}
                    </strong>
                  </div>
                </div>
              )}
            </article>
          </div>

          <div
            className={`signing-flow ${flowState}`}
          >
            <div className="flow-item">
              <span>USER</span>
              <strong>
                Authorization
              </strong>
            </div>

            <div className="flow-link" />

            <div className="flow-item">
              <span>TOOL</span>
              <strong>
                Signed evidence
              </strong>
            </div>

            <div className="flow-link" />

            <div className="flow-item bound">
              <span>BOUND</span>
              <strong>
                Integrity gate
              </strong>
            </div>

            <div className="flow-link final" />

            <div className="flow-item signer">
              <span>SIGNER</span>
              <strong>
                {flowState === "allow"
                  ? "Eligible"
                  : flowState === "block"
                    ? "Closed"
                    : "Waiting"}
              </strong>
            </div>
          </div>
        </section>

        <section className="replay-section">
          <div className="replay-copy">
            <div className="section-index">
              02 / REPLAY
            </div>

            <h2>
              Use the same evidence twice.
            </h2>

            <p>
              This test exercises the real
              evidence-use store. The first
              gate may consume fresh evidence;
              the second attempt must not be
              reusable.
            </p>

            <button
              className="primary-button dark"
              onClick={testReplay}
              disabled={
                !session ||
                testingReplay ||
                Boolean(replayResult) ||
                sessionExpired
              }
            >
              {testingReplay
                ? "Testing replay…"
                : replayResult
                  ? "Replay tested"
                  : "Test replay protection"}
            </button>
          </div>

          <div className="replay-record">
            {!replayResult ? (
              <div className="replay-empty">
                <span>01 → 02</span>
                <p>
                  Run the same signed evidence
                  through the execution gate
                  twice.
                </p>
              </div>
            ) : (
              <>
                <div className="replay-attempt">
                  <span>
                    FIRST GATE
                  </span>

                  <strong className="allow-text">
                    {
                      replayResult
                        .firstGate
                        .decision
                    }
                  </strong>

                  <code>
                    {
                      replayResult
                        .firstGate
                        .findings[0]
                        ?.code
                    }
                  </code>
                </div>

                <div className="replay-arrow">
                  →
                </div>

                <div className="replay-attempt">
                  <span>
                    SECOND GATE
                  </span>

                  <strong className="block-text">
                    {
                      replayResult
                        .secondGate
                        .decision
                    }
                  </strong>

                  <code>
                    {
                      replayResult
                        .secondGate
                        .findings[0]
                        ?.code
                    }
                  </code>
                </div>
              </>
            )}
          </div>
        </section>

        <section
          className="proof-section"
          id="onchain-proof"
        >
          <div className="section-heading proof-heading">
            <div>
              <div className="section-index">
                03 / ONCHAIN PROOF
              </div>

              <h2>
                Read the transaction from
                BSC Testnet.
              </h2>
            </div>

            <button
              className="secondary-button"
              onClick={
                fetchOnchainProof
              }
              disabled={loadingProof}
            >
              {loadingProof
                ? "Reading chain…"
                : proof
                  ? "Refresh proof"
                  : "Fetch live proof"}
            </button>
          </div>

          <div className="proof-layout">
            <div className="proof-hash">
              <span>
                RECORDED TRANSACTION
              </span>

              <code>
                {PROOF_HASH}
              </code>

              <p>
                The record below is fetched
                through the BOUND API from
                BSC Testnet when requested.
              </p>
            </div>

            <div className="proof-record">
              {!proof ? (
                <div className="proof-empty">
                  <span>CHAIN READ</span>

                  <strong>
                    Not fetched yet
                  </strong>

                  <p>
                    Fetch the record to verify
                    the transaction currently
                    exists on BSC Testnet.
                  </p>
                </div>
              ) : (
                <>
                  <div className="proof-status">
                    <span className="chain-dot" />

                    <span>
                      {
                        proof.receiptStatus
                      }
                    </span>

                    <strong>
                      {proof.valueTbnb} tBNB
                    </strong>
                  </div>

                  <dl className="proof-table">
                    <div>
                      <dt>Network</dt>
                      <dd>
                        {proof.network}
                      </dd>
                    </div>

                    <div>
                      <dt>Block</dt>
                      <dd>
                        {
                          proof.blockNumber
                        }
                      </dd>
                    </div>

                    <div>
                      <dt>From</dt>
                      <dd
                        title={
                          proof.from
                        }
                      >
                        {shortHex(
                          proof.from,
                          12,
                          10,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt>To</dt>
                      <dd
                        title={
                          proof.to ?? ""
                        }
                      >
                        {proof.to
                          ? shortHex(
                              proof.to,
                              12,
                              10,
                            )
                          : "—"}
                      </dd>
                    </div>

                    <div>
                      <dt>Input</dt>
                      <dd>{proof.input}</dd>
                    </div>

                    <div>
                      <dt>Gas used</dt>
                      <dd>
                        {proof.gasUsed}
                      </dd>
                    </div>
                  </dl>

                  <a
                    className="bscscan-link"
                    href={`https://testnet.bscscan.com/tx/${proof.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open BscScan ↗
                  </a>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="details-section">
          <details>
            <summary>
              Technical details
              <span>+</span>
            </summary>

            <div className="details-grid">
              <div>
                <span>
                  USER AUTHORIZATION
                </span>

                <strong>EIP-712</strong>

                <p>
                  A trusted user signer
                  authorizes the resource,
                  network, source and maximum
                  spend for a bounded period.
                </p>
              </div>

              <div>
                <span>
                  TOOL PROVENANCE
                </span>

                <strong>Ed25519</strong>

                <p>
                  Signed upstream evidence is
                  checked against the pinned
                  trusted source key.
                </p>
              </div>

              <div>
                <span>
                  TRANSACTION BINDING
                </span>

                <strong>
                  Exact critical fields
                </strong>

                <p>
                  Chain, recipient, value and
                  calldata are checked before
                  the transaction reaches the
                  signing boundary.
                </p>
              </div>

              <div>
                <span>
                  CURRENT LIMIT
                </span>

                <strong>
                  Consistency, not global
                  safety
                </strong>

                <p>
                  BOUND does not determine
                  whether a trusted tool is
                  honest or whether a
                  recipient is a scam.
                </p>
              </div>
            </div>
          </details>
        </section>
      </main>

      <footer>
        <span>
          BOUND
        </span>

        <p>
          Context integrity before execution.
        </p>

        <span>
          Prototype · BSC Testnet
        </span>
      </footer>
    </div>
  );
}

export default App;
