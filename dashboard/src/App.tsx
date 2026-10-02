import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

type ScenarioId =
  | "clean"
  | "amount"
  | "recipient"
  | "replay";

type Scenario = {
  id: ScenarioId;
  number: string;
  label: string;
  title: string;
  description: string;
  action: string;
};

type RunState =
  | "idle"
  | "running"
  | "done"
  | "error";

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

const scenarios: Scenario[] = [
  {
    id: "clean",
    number: "01",
    label: "CLEAN FLOW",
    title: "Everything still agrees.",
    description:
      "The candidate preserves the recipient, amount, network, and calldata from signed upstream evidence.",
    action: "Run clean execution",
  },
  {
    id: "amount",
    number: "02",
    label: "AMOUNT DRIFT",
    title: "Inside the limit. Outside the evidence.",
    description:
      "The user allows up to 0.005 tBNB, but the signed quote is exactly 0.001 tBNB. The candidate is changed to 0.004321 tBNB.",
    action: "Run amount drift",
  },
  {
    id: "recipient",
    number: "03",
    label: "RECIPIENT CORRUPTION",
    title: "The destination changes after attestation.",
    description:
      "The trusted evidence still names the original vendor while the candidate transaction points somewhere else.",
    action: "Run recipient corruption",
  },
  {
    id: "replay",
    number: "04",
    label: "REPLAY ATTEMPT",
    title: "Valid evidence should not become reusable authority.",
    description:
      "Fresh signed evidence reaches the gate once. The second use of the same evidence identifier must be rejected.",
    action: "Run replay attempt",
  },
];

async function requestJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${API_BASE}${path}`,
    options,
  );

  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const payload =
      body as ApiErrorPayload | null;

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
    throw new Error(
      "Amount must be a non-negative decimal number.",
    );
  }

  const [wholePart, fractionPart = ""] =
    normalized.split(".");

  if (fractionPart.length > 18) {
    throw new Error(
      "tBNB supports at most 18 decimal places.",
    );
  }

  const paddedFraction =
    fractionPart.padEnd(18, "0");

  return (
    BigInt(wholePart || "0") *
    10n ** 18n +
    BigInt(paddedFraction || "0")
  ).toString();
}

function shortHex(
  value: string,
  left = 8,
  right = 6,
) {
  if (
    value.length <=
    left + right + 3
  ) {
    return value;
  }

  return `${value.slice(
    0,
    left,
  )}…${value.slice(-right)}`;
}

function navigate(to: string) {
  window.history.pushState(
    {},
    "",
    to,
  );

  window.dispatchEvent(
    new PopStateEvent("popstate"),
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function RouteLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function BrandMark() {
  return (
    <span
      className="brand-mark"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
      >
        <path
          d="M5 8.5H13.2C17.1 8.5 20.3 11.7 20.3 15.6V20.4C20.3 24.3 23.5 27.5 27.4 27.5H31"
          stroke="currentColor"
          strokeWidth="1.8"
        />

        <path
          d="M5 18H31"
          stroke="currentColor"
          strokeWidth="1.8"
        />

        <path
          d="M5 27.5H8.6C12.5 27.5 15.7 24.3 15.7 20.4V15.6C15.7 11.7 18.9 8.5 22.8 8.5H31"
          stroke="currentColor"
          strokeWidth="1.8"
        />

        <circle
          cx="18"
          cy="18"
          r="3.1"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

function SiteHeader({
  path,
  apiOnline,
}: {
  path: string;
  apiOnline: boolean | null;
}) {
  return (
    <header className="site-header">
      <RouteLink
        to="/"
        className="site-brand"
      >
        <BrandMark />
        <span>BOUND</span>
      </RouteLink>

      <nav className="site-nav">
        <RouteLink
          to="/"
          className={
            path === "/" ? "active" : ""
          }
        >
          Product
        </RouteLink>

        <RouteLink
          to="/app"
          className={
            path === "/app"
              ? "active"
              : ""
          }
        >
          Lab
        </RouteLink>

        <RouteLink
          to="/proof"
          className={
            path === "/proof"
              ? "active"
              : ""
          }
        >
          Proof
        </RouteLink>

        <RouteLink
          to="/docs"
          className={
            path === "/docs"
              ? "active"
              : ""
          }
        >
          Docs
        </RouteLink>
      </nav>

      <div className="header-meta">
        <span>BSC TESTNET</span>

        <span
          className={`live-status ${apiOnline === true
            ? "online"
            : apiOnline === false
              ? "offline"
              : ""
            }`}
        >
          <i />

          {apiOnline === null
            ? "checking"
            : apiOnline
              ? "api live"
              : "api offline"}
        </span>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <BrandMark />

        <div>
          <strong>BOUND</strong>
          <span>
            Context integrity before
            execution.
          </span>
        </div>
      </div>

      <div className="footer-links">
        <RouteLink to="/app">
          Lab
        </RouteLink>

        <RouteLink to="/proof">
          Proof
        </RouteLink>

        <RouteLink to="/docs">
          Docs
        </RouteLink>
      </div>

      <div className="footer-state">
        <span>Prototype</span>
        <span>BSC Testnet</span>
      </div>
    </footer>
  );
}

function HomeFlow() {
  return (
    <div className="home-flow">
      <div className="home-flow-head">
        <span>
          LIVE EXECUTION MODEL
        </span>

        <strong>
          Context enters from three
          directions.
        </strong>
      </div>

      <div className="home-source hs-user">
        <span>USER</span>
        <strong>
          ≤ 0.005 tBNB
        </strong>
        <small>EIP-712 mandate</small>
      </div>

      <div className="home-source hs-tool">
        <span>TOOL</span>
        <strong>
          0.001 tBNB
        </strong>
        <small>
          signed Ed25519 evidence
        </small>
      </div>

      <div className="home-source hs-agent">
        <span>CANDIDATE</span>
        <strong>
          0.004321 tBNB
        </strong>
        <small>controlled drift</small>
      </div>

      <div className="home-rail hr-one">
        <i />
      </div>

      <div className="home-rail hr-two">
        <i />
      </div>

      <div className="home-rail hr-three">
        <i />
      </div>

      <div className="home-bound-node">
        <span>B</span>
        <small>BOUND</small>
      </div>

      <div className="home-output-rail" />

      <div className="home-signer">
        <span>SIGNER</span>
        <div className="closed-bars">
          <i />
          <i />
        </div>
        <strong>CLOSED</strong>
      </div>

      <div className="home-flow-result">
        <span>
          AMOUNT PROVENANCE
        </span>

        <strong>BLOCK</strong>

        <small>
          0.004321 ≠ 0.001
        </small>
      </div>
    </div>
  );
}

function HomePage() {
  return (
    <>
      <main className="home-page">
        <section className="home-hero">
          <div className="hero-copy">
            <span className="micro-label">
              CONTEXT INTEGRITY FOR
              ONCHAIN AI AGENTS
            </span>

            <h1>
              AI agents can
              <br />
              improvise.
              <br />

              <em>
                Signing shouldn’t.
              </em>
            </h1>

            <p>
              BOUND checks whether the
              exact transaction reaching
              a signer still agrees with
              what the user authorized
              and what a trusted tool
              actually attested.
            </p>

            <div className="hero-actions">
              <RouteLink
                to="/app"
                className="primary-link"
              >
                Run the live lab
                <span>↗</span>
              </RouteLink>

              <RouteLink
                to="/proof"
                className="text-link"
              >
                Inspect real proof
              </RouteLink>
            </div>
          </div>

          <HomeFlow />
        </section>

        <section className="home-demo-teaser">
          <div>
            <span className="micro-label">
              ONE CLICK DEMO
            </span>

            <h2>
              The policy passes.
              <br />
              The evidence does not.
            </h2>
          </div>

          <div className="teaser-equation">
            <div>
              <span>USER LIMIT</span>

              <strong>
                0.004321
                <i>≤</i>
                0.005
              </strong>

              <small className="allow-text">
                PASS
              </small>
            </div>

            <div>
              <span>
                SIGNED EVIDENCE
              </span>

              <strong>
                0.004321
                <i>≠</i>
                0.001
              </strong>

              <small className="block-text">
                BREAK
              </small>
            </div>

            <div className="teaser-block">
              <span>BOUND</span>
              <strong>BLOCK</strong>
            </div>
          </div>
        </section>

        <section className="home-final">
          <span className="micro-label">
            BEFORE THE KEY
          </span>

          <h2>
            Let the agent propose.
            <br />
            Let evidence decide whether
            the proposal reaches the
            signer.
          </h2>

          <RouteLink
            to="/app"
            className="primary-link"
          >
            Open Execution Lab
            <span>→</span>
          </RouteLink>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function ExecutionLabPage() {
  const [selected, setSelected] =
    useState<ScenarioId>("amount");

  const [runState, setRunState] =
    useState<RunState>("idle");

  const [session, setSession] =
    useState<Session | null>(null);

  const [
    verification,
    setVerification,
  ] =
    useState<VerificationResult | null>(
      null,
    );

  const [
    replayResult,
    setReplayResult,
  ] =
    useState<ReplayResult | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(null);

  const [inspectorOpen, setInspectorOpen] =
    useState(false);

  const scenario =
    scenarios.find(
      (item) => item.id === selected,
    ) ?? scenarios[1];

  const candidate =
    useMemo(() => {
      if (!session) {
        return null;
      }

      if (selected === "amount") {
        return {
          chainId:
            session.transaction.chainId,
          to: session.transaction.to,
          valueWei:
            tbnbToWei("0.004321"),
          amountTbnb: "0.004321",
          data:
            session.transaction.data,
        };
      }

      if (
        selected === "recipient"
      ) {
        return {
          chainId:
            session.transaction.chainId,
          to: MUTATED_RECIPIENT,
          valueWei:
            session.transaction.valueWei,
          amountTbnb:
            session.evidence.amountTbnb,
          data:
            session.transaction.data,
        };
      }

      return {
        chainId:
          session.transaction.chainId,
        to: session.transaction.to,
        valueWei:
          session.transaction.valueWei,
        amountTbnb:
          session.evidence.amountTbnb,
        data:
          session.transaction.data,
      };
    }, [session, selected]);

  const decision =
    selected === "replay"
      ? replayResult?.secondGate
        .decision
      : verification?.verification
        .decision;

  const firstReplay =
    replayResult?.firstGate.decision;

  const primaryCode =
    selected === "replay"
      ? replayResult?.secondGate
        .findings[0]?.code
      : verification?.verification
        .findings[0]?.code;

  const signerState =
    decision === "ALLOW"
      ? "ELIGIBLE"
      : decision
        ? "CLOSED"
        : "WAITING";

  const recipientMatches =
    verification?.comparison
      .recipient.matches;

  const amountMatches =
    verification?.comparison
      .amount.matches;

  const chainMatches =
    verification?.comparison
      .chain.matches;

  const calldataMatches =
    verification?.comparison
      .calldata.matches;

  function changeScenario(
    id: ScenarioId,
  ) {
    setSelected(id);
    setRunState("idle");
    setSession(null);
    setVerification(null);
    setReplayResult(null);
    setError(null);
    setInspectorOpen(false);
  }

  async function runScenario() {
    try {
      setRunState("running");
      setSession(null);
      setVerification(null);
      setReplayResult(null);
      setError(null);

      const freshSession =
        await requestJson<Session>(
          "/api/session",
          {
            method: "POST",
          },
        );

      setSession(freshSession);

      if (selected === "replay") {
        const replay =
          await requestJson<ReplayResult>(
            "/api/replay-test",
            {
              method: "POST",

              headers: {
                "content-type":
                  "application/json",
              },

              body: JSON.stringify({
                sessionId:
                  freshSession.sessionId,

                transaction:
                  freshSession.transaction,
              }),
            },
          );

        setReplayResult(replay);
        setRunState("done");
        return;
      }

      let transaction = {
        ...freshSession.transaction,
      };

      if (selected === "amount") {
        transaction = {
          ...transaction,
          valueWei:
            tbnbToWei("0.004321"),
        };
      }

      if (
        selected === "recipient"
      ) {
        transaction = {
          ...transaction,
          to: MUTATED_RECIPIENT,
        };
      }

      const result =
        await requestJson<VerificationResult>(
          "/api/verify",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body: JSON.stringify({
              sessionId:
                freshSession.sessionId,

              transaction,
            }),
          },
        );

      setVerification(result);
      setRunState("done");
    } catch (caught) {
      setRunState("error");

      setError(
        caught instanceof Error
          ? caught.message
          : "Scenario execution failed.",
      );
    }
  }

  const displayedMax =
    session?.authorization
      .maxAmountTbnb ?? "0.005";

  const displayedEvidenceAmount =
    session?.evidence.amountTbnb ??
    "0.001";

  const displayedRecipient =
    session?.evidence.recipient ??
    "0x32438dE3179DF205c63e8793A20BA6885762f537";

  const displayedCandidateAmount =
    selected === "amount"
      ? "0.004321"
      : displayedEvidenceAmount;

  const displayedCandidateRecipient =
    selected === "recipient"
      ? MUTATED_RECIPIENT
      : displayedRecipient;

  const stageClass = [
    "execution-stage",
    `scenario-${selected}`,
    `state-${runState}`,
    decision
      ? `decision-${decision.toLowerCase()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <main className="lab-page">
        <section className="lab-heading">
          <div>
            <span className="micro-label">
              LIVE EXECUTION LAB
            </span>

            <h1>
              Break the context.
              <br />
              Watch the signer stop.
            </h1>
          </div>

          <p>
            No transaction fields need
            to be typed. Pick a controlled
            scenario and BOUND will call
            the real local verification
            API behind this prototype.
          </p>
        </section>

        <section className="scenario-selector">
          {scenarios.map((item) => (
            <button
              key={item.id}
              className={
                selected === item.id
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeScenario(item.id)
              }
              disabled={
                runState === "running"
              }
            >
              <span>
                {item.number}
              </span>

              <strong>
                {item.label}
              </strong>

              <small>
                {item.title}
              </small>
            </button>
          ))}
        </section>

        <section className="scenario-intro">
          <div>
            <span>
              {scenario.number} /{" "}
              {scenario.label}
            </span>

            <h2>
              {scenario.title}
            </h2>

            <p>
              {scenario.description}
            </p>
          </div>

          <button
            className="run-scenario"
            onClick={() =>
              void runScenario()
            }
            disabled={
              runState === "running"
            }
          >
            <span>
              {runState === "running"
                ? "BOUND is checking…"
                : scenario.action}
            </span>

            <span>→</span>
          </button>
        </section>

        {error && (
          <div className="lab-error">
            <strong>
              Scenario stopped.
            </strong>

            <span>{error}</span>
          </div>
        )}

        <section className={stageClass}>
          <div className="source-node source-user">
            <span>USER MANDATE</span>

            <strong>
              ≤ {displayedMax} tBNB
            </strong>

            <small>EIP-712</small>
          </div>

          <div className="source-node source-tool">
            <span>
              SIGNED EVIDENCE
            </span>

            <strong>
              {displayedEvidenceAmount}{" "}
              tBNB
            </strong>

            <small>
              {session
                ? shortHex(
                  displayedRecipient,
                  8,
                  6,
                )
                : "trusted vendor"}
            </small>
          </div>

          <div className="source-node source-candidate">
            <span>
              CANDIDATE TX
            </span>

            <strong>
              {displayedCandidateAmount}{" "}
              tBNB
            </strong>

            <small>
              {shortHex(
                displayedCandidateRecipient,
                8,
                6,
              )}
            </small>
          </div>

          <div className="stage-rail rail-user">
            <i />
          </div>

          <div className="stage-rail rail-tool">
            <i />
          </div>

          <div className="stage-rail rail-candidate">
            <i />
          </div>

          <div className="bound-engine">
            <div className="bound-ring outer-ring" />
            <div className="bound-ring inner-ring" />

            <strong>B</strong>

            <span>BOUND</span>

            <small>
              context integrity
            </small>
          </div>

          <div className="signer-rail">
            <i />
          </div>

          <div
            className={`signer-node ${signerState.toLowerCase()
              }`}
          >
            <span>
              SIGNER BOUNDARY
            </span>

            <div className="signer-door">
              <i />
              <i />
            </div>

            <strong>
              {signerState}
            </strong>
          </div>

          <div className="stage-status">
            {runState === "idle" && (
              <>
                <span>
                  READY
                </span>

                <strong>
                  Run the selected
                  scenario.
                </strong>
              </>
            )}

            {runState ===
              "running" && (
                <>
                  <span>
                    VERIFYING
                  </span>

                  <strong>
                    Binding trusted context
                    to the candidate…
                  </strong>
                </>
              )}

            {runState === "error" && (
              <>
                <span>ERROR</span>

                <strong>
                  API request stopped.
                </strong>
              </>
            )}

            {runState === "done" &&
              selected !== "replay" && (
                <>
                  <span>
                    BOUND DECISION
                  </span>

                  <strong
                    className={
                      decision === "ALLOW"
                        ? "allow-text"
                        : "block-text"
                    }
                  >
                    {decision}
                  </strong>

                  <code>
                    {primaryCode}
                  </code>
                </>
              )}

            {runState === "done" &&
              selected === "replay" && (
                <>
                  <span>
                    REPLAY RESULT
                  </span>

                  <strong className="block-text">
                    SECOND USE BLOCKED
                  </strong>

                  <code>
                    {primaryCode}
                  </code>
                </>
              )}
          </div>
        </section>

        {selected !== "replay" ? (
          <section className="verification-strip">
            <div>
              <span>RECIPIENT</span>

              <strong
                className={
                  recipientMatches ===
                    false
                    ? "block-text"
                    : recipientMatches ===
                      true
                      ? "allow-text"
                      : ""
                }
              >
                {recipientMatches ===
                  undefined
                  ? "—"
                  : recipientMatches
                    ? "MATCH"
                    : "BREAK"}
              </strong>
            </div>

            <div>
              <span>AMOUNT</span>

              <strong
                className={
                  amountMatches === false
                    ? "block-text"
                    : amountMatches === true
                      ? "allow-text"
                      : ""
                }
              >
                {amountMatches ===
                  undefined
                  ? "—"
                  : amountMatches
                    ? "MATCH"
                    : "BREAK"}
              </strong>
            </div>

            <div>
              <span>NETWORK</span>

              <strong
                className={
                  chainMatches === false
                    ? "block-text"
                    : chainMatches === true
                      ? "allow-text"
                      : ""
                }
              >
                {chainMatches === undefined
                  ? "—"
                  : chainMatches
                    ? "MATCH"
                    : "BREAK"}
              </strong>
            </div>

            <div>
              <span>CALLDATA</span>

              <strong
                className={
                  calldataMatches ===
                    false
                    ? "block-text"
                    : calldataMatches ===
                      true
                      ? "allow-text"
                      : ""
                }
              >
                {calldataMatches ===
                  undefined
                  ? "—"
                  : calldataMatches
                    ? "MATCH"
                    : "BREAK"}
              </strong>
            </div>
          </section>
        ) : (
          <section className="replay-strip">
            <div>
              <span>
                FIRST GATE
              </span>

              <strong
                className={
                  firstReplay === "ALLOW"
                    ? "allow-text"
                    : ""
                }
              >
                {firstReplay ?? "—"}
              </strong>

              <small>
                fresh evidence
              </small>
            </div>

            <div className="replay-connector">
              →
            </div>

            <div>
              <span>
                SAME EVIDENCE
              </span>

              <strong
                className={
                  decision === "BLOCK"
                    ? "block-text"
                    : ""
                }
              >
                {decision ?? "—"}
              </strong>

              <small>
                second gate
              </small>
            </div>
          </section>
        )}

        <section className="lab-explanation">
          <div>
            <span className="micro-label">
              WHAT JUST HAPPENED
            </span>

            {selected === "clean" && (
              <h2>
                The proposal preserved
                the trusted context.
              </h2>
            )}

            {selected === "amount" && (
              <h2>
                The user limit still
                passes. The provenance
                does not.
              </h2>
            )}

            {selected ===
              "recipient" && (
                <h2>
                  The amount stayed valid.
                  The destination did not.
                </h2>
              )}

            {selected === "replay" && (
              <h2>
                A valid evidence packet
                did not become reusable
                authority.
              </h2>
            )}
          </div>

          <div className="explanation-facts">
            {selected === "amount" && (
              <>
                <div>
                  <span>
                    USER POLICY
                  </span>

                  <strong>
                    0.004321 ≤ 0.005
                  </strong>

                  <small className="allow-text">
                    within limit
                  </small>
                </div>

                <div>
                  <span>
                    EVIDENCE BINDING
                  </span>

                  <strong>
                    0.004321 ≠ 0.001
                  </strong>

                  <small className="block-text">
                    provenance break
                  </small>
                </div>
              </>
            )}

            {selected ===
              "recipient" && (
                <>
                  <div>
                    <span>
                      ATTESTED
                    </span>

                    <strong>
                      {shortHex(
                        displayedRecipient,
                        10,
                        8,
                      )}
                    </strong>

                    <small>
                      trusted evidence
                    </small>
                  </div>

                  <div>
                    <span>
                      PROPOSED
                    </span>

                    <strong>
                      {shortHex(
                        MUTATED_RECIPIENT,
                        10,
                        8,
                      )}
                    </strong>

                    <small className="block-text">
                      differs
                    </small>
                  </div>
                </>
              )}

            {selected === "clean" && (
              <>
                <div>
                  <span>
                    TOOL EVIDENCE
                  </span>

                  <strong>
                    {displayedEvidenceAmount}{" "}
                    tBNB
                  </strong>

                  <small>
                    signed reference
                  </small>
                </div>

                <div>
                  <span>
                    CANDIDATE
                  </span>

                  <strong>
                    {displayedCandidateAmount}{" "}
                    tBNB
                  </strong>

                  <small className="allow-text">
                    exact match
                  </small>
                </div>
              </>
            )}

            {selected === "replay" && (
              <>
                <div>
                  <span>
                    FIRST USE
                  </span>

                  <strong>
                    {firstReplay ?? "—"}
                  </strong>

                  <small className="allow-text">
                    fresh evidence
                  </small>
                </div>

                <div>
                  <span>
                    SECOND USE
                  </span>

                  <strong>
                    {decision ?? "—"}
                  </strong>

                  <small className="block-text">
                    evidence already used
                  </small>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="raw-inspector">
          <button
            className="inspector-toggle"
            onClick={() =>
              setInspectorOpen(
                (current) => !current,
              )
            }
          >
            <span>
              INSPECT RAW TRANSACTION
            </span>

            <span>
              {inspectorOpen
                ? "−"
                : "+"}
            </span>
          </button>

          {inspectorOpen && (
            <div className="inspector-body">
              <div>
                <span>SESSION</span>
                <code>
                  {session?.sessionId ??
                    "Run a scenario first"}
                </code>
              </div>

              <div>
                <span>CHAIN ID</span>
                <code>
                  {candidate?.chainId ??
                    "97"}
                </code>
              </div>

              <div>
                <span>RECIPIENT</span>
                <code>
                  {candidate?.to ??
                    displayedCandidateRecipient}
                </code>
              </div>

              <div>
                <span>VALUE</span>
                <code>
                  {candidate
                    ? `${candidate.amountTbnb} tBNB`
                    : `${displayedCandidateAmount} tBNB`}
                </code>
              </div>

              <div>
                <span>CALLDATA</span>
                <code>
                  {candidate?.data ??
                    "0x"}
                </code>
              </div>

              <div>
                <span>
                  SIGNER INVOKED
                </span>

                <code>
                  {verification
                    ? String(
                      verification
                        .signerInvoked,
                    )
                    : replayResult
                      ? String(
                        replayResult
                          .signerInvoked,
                      )
                      : "—"}
                </code>
              </div>

              <div>
                <span>BROADCAST</span>

                <code>
                  {verification
                    ? String(
                      verification
                        .broadcast,
                    )
                    : replayResult
                      ? String(
                        replayResult
                          .broadcast,
                      )
                      : "—"}
                </code>
              </div>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function ProofPage() {
  const [
    replayResult,
    setReplayResult,
  ] =
    useState<ReplayResult | null>(
      null,
    );

  const [proof, setProof] =
    useState<OnchainProof | null>(
      null,
    );

  const [
    replayLoading,
    setReplayLoading,
  ] = useState(false);

  const [
    proofLoading,
    setProofLoading,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function runReplay() {
    try {
      setReplayLoading(true);
      setReplayResult(null);
      setError(null);

      const session =
        await requestJson<Session>(
          "/api/session",
          {
            method: "POST",
          },
        );

      const result =
        await requestJson<ReplayResult>(
          "/api/replay-test",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body: JSON.stringify({
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
      setReplayLoading(false);
    }
  }

  async function fetchProof() {
    try {
      setProofLoading(true);
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
      setProofLoading(false);
    }
  }

  return (
    <>
      <main className="proof-page">
        <section className="proof-hero">
          <span className="micro-label">
            VERIFIABLE PROTOTYPE
          </span>

          <h1>
            Don’t trust the demo.
            <br />
            Inspect it.
          </h1>

          <p>
            Two claims below are exercised
            against the actual prototype:
            replay protection and a real
            BSC Testnet transaction
            read-back.
          </p>
        </section>

        {error && (
          <div className="lab-error">
            <strong>
              Request failed.
            </strong>

            <span>{error}</span>
          </div>
        )}

        <section className="proof-row">
          <div className="proof-copy">
            <span>01 / REPLAY</span>

            <h2>
              Same evidence.
              <br />
              Second gate.
            </h2>

            <p>
              Fresh signed evidence may
              pass once. Reusing the same
              evidence identifier must
              not authorize another
              signing attempt.
            </p>

            <button
              onClick={() =>
                void runReplay()
              }
              disabled={replayLoading}
            >
              {replayLoading
                ? "running…"
                : "Run replay proof"}
              <span>→</span>
            </button>
          </div>

          <div className="proof-result replay-proof">
            <div>
              <span>FIRST GATE</span>

              <strong
                className={
                  replayResult
                    ?.firstGate
                    .decision === "ALLOW"
                    ? "allow-text"
                    : ""
                }
              >
                {replayResult
                  ?.firstGate
                  .decision ?? "—"}
              </strong>

              <small>
                {replayResult
                  ?.firstGate
                  .findings[0]?.code ??
                  "fresh evidence"}
              </small>
            </div>

            <i>→</i>

            <div>
              <span>
                SAME EVIDENCE
              </span>

              <strong
                className={
                  replayResult
                    ?.secondGate
                    .decision === "BLOCK"
                    ? "block-text"
                    : ""
                }
              >
                {replayResult
                  ?.secondGate
                  .decision ?? "—"}
              </strong>

              <small>
                {replayResult
                  ?.secondGate
                  .findings[0]?.code ??
                  "awaiting proof"}
              </small>
            </div>
          </div>
        </section>

        <section className="proof-row">
          <div className="proof-copy">
            <span>
              02 / ONCHAIN READ-BACK
            </span>

            <h2>
              A transaction that
              actually exists.
            </h2>

            <p>
              The API reads the fixed
              transaction hash from BSC
              Testnet instead of
              rendering a hard-coded
              success state.
            </p>

            <button
              onClick={() =>
                void fetchProof()
              }
              disabled={proofLoading}
            >
              {proofLoading
                ? "reading chain…"
                : "Read BSC Testnet"}
              <span>→</span>
            </button>
          </div>

          <div className="proof-result chain-proof">
            <div className="proof-hash">
              <span>TRANSACTION</span>

              <code>
                {shortHex(
                  PROOF_HASH,
                  18,
                  14,
                )}
              </code>
            </div>

            {!proof ? (
              <div className="await-proof">
                <span>BSC TESTNET</span>

                <strong>
                  Awaiting live read
                </strong>
              </div>
            ) : (
              <>
                <div className="proof-value">
                  <span>
                    CONFIRMED VALUE
                  </span>

                  <strong>
                    {proof.valueTbnb}
                  </strong>

                  <small>tBNB</small>
                </div>

                <div className="proof-grid">
                  <div>
                    <span>STATUS</span>
                    <strong className="allow-text">
                      {proof.receiptStatus}
                    </strong>
                  </div>

                  <div>
                    <span>BLOCK</span>
                    <strong>
                      {proof.blockNumber}
                    </strong>
                  </div>

                  <div>
                    <span>GAS</span>
                    <strong>
                      {proof.gasUsed}
                    </strong>
                  </div>

                  <div>
                    <span>INPUT</span>
                    <strong>
                      {proof.input}
                    </strong>
                  </div>
                </div>

                <a
                  href={`https://testnet.bscscan.com/tx/${proof.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open BscScan ↗
                </a>
              </>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function DocsPage() {
  return (
    <>
      <main className="docs-page">
        <aside className="docs-sidebar">
          <span>BOUND DOCS</span>

          <nav>
            <a href="#overview">
              Overview
            </a>

            <a href="#binding">
              What is bound
            </a>

            <a href="#trust">
              Trust model
            </a>

            <a href="#decisions">
              Decisions
            </a>

            <a href="#replay">
              Replay model
            </a>

            <a href="#scope">
              Prototype scope
            </a>

            <a href="#non-goals">
              Non-goals
            </a>
          </nav>
        </aside>

        <article className="docs-content">
          <section id="overview">
            <span className="micro-label">
              THE DESIGN
            </span>

            <h1>
              Context integrity before
              execution.
            </h1>

            <p className="docs-lead">
              BOUND verifies whether the
              exact transaction an
              autonomous agent wants to
              sign still agrees with
              trusted authorization and
              signed upstream evidence.
            </p>
          </section>

          <section id="binding">
            <h2>
              What BOUND binds
            </h2>

            <p>
              The native tBNB prototype
              compares the
              transaction-critical
              fields that determine what
              will execute: chain,
              recipient, amount, and
              calldata.
            </p>

            <div className="docs-spec">
              <div>
                <span>USER</span>
                <strong>EIP-712</strong>

                <p>
                  A time-bounded spending
                  authorization signed by
                  the user.
                </p>
              </div>

              <div>
                <span>TOOL</span>
                <strong>Ed25519</strong>

                <p>
                  Evidence from a trusted
                  source whose public key
                  is pinned independently.
                </p>
              </div>

              <div>
                <span>AGENT</span>
                <strong>
                  Transaction
                </strong>

                <p>
                  The exact candidate
                  transaction presented
                  before the signer
                  boundary.
                </p>
              </div>
            </div>
          </section>

          <section id="trust">
            <h2>Trust model</h2>

            <p>
              BOUND does not infer trust
              from a source name. The
              source identifier is a
              label; the trust anchor is
              the pinned public key used
              to verify the evidence
              signature.
            </p>

            <p>
              The user authorization is
              checked against an
              independently trusted signer
              address rather than accepting
              any signer supplied by the
              request itself.
            </p>

            <aside className="docs-note">
              If a trusted tool itself is
              compromised and signs a
              malicious recipient, BOUND
              can still verify consistency.
              It cannot prove that the
              trusted source was honest.
            </aside>
          </section>

          <section id="decisions">
            <h2>
              Decision semantics
            </h2>

            <div className="decision-doc">
              <div>
                <strong className="allow-text">
                  ALLOW
                </strong>

                <p>
                  The implemented
                  provenance and
                  authorization checks
                  passed.
                </p>
              </div>

              <div>
                <strong className="block-text">
                  BLOCK
                </strong>

                <p>
                  At least one required
                  transaction-critical
                  field violated the
                  trusted context.
                </p>
              </div>

              <div>
                <strong>
                  NEEDS_REAUTHORIZATION
                </strong>

                <p>
                  The transaction cannot
                  proceed under the
                  current authorization.
                </p>
              </div>
            </div>

            <aside className="docs-note">
              ALLOW is not a claim that a
              transaction is globally
              safe.
            </aside>
          </section>

          <section id="replay">
            <h2>Replay model</h2>

            <p>
              Signed tool evidence is
              consumed only when the
              signing gate returns ALLOW.
              The local evidence-use
              store records the evidence
              identifier so the same
              evidence cannot authorize a
              second signing attempt.
            </p>

            <p>
              The current prototype uses
              a local filesystem store.
              It is not a distributed
              replay database.
            </p>
          </section>

          <section id="scope">
            <h2>
              Current prototype scope
            </h2>

            <p>
              The browser experience
              demonstrates native tBNB
              verification on BNB Smart
              Chain Testnet. Browser
              verification does not
              receive the agent wallet
              private key.
            </p>

            <p>
              A separate guarded signer
              implementation exists for
              controlled server-side
              execution after the same
              authorization and evidence
              checks pass.
            </p>
          </section>

          <section id="non-goals">
            <h2>Non-goals</h2>

            <p>
              The prototype does not
              claim to stop every form of
              prompt injection, detect
              scams, determine whether a
              trusted tool is honest, or
              establish universal
              transaction safety.
            </p>

            <p>
              Its responsibility is
              narrower: preserve the
              integrity of
              transaction-critical
              context immediately before
              signing.
            </p>
          </section>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}

function NotFoundPage() {
  return (
    <>
      <main className="not-found">
        <span className="micro-label">
          404
        </span>

        <h1>
          Nothing is bound here.
        </h1>

        <RouteLink
          to="/"
          className="primary-link"
        >
          Return home
          <span>←</span>
        </RouteLink>
      </main>

      <SiteFooter />
    </>
  );
}

function App() {
  const [path, setPath] =
    useState(
      window.location.pathname,
    );

  const [apiOnline, setApiOnline] =
    useState<boolean | null>(null);

  useEffect(() => {
    function onPopState() {
      setPath(
        window.location.pathname,
      );
    }

    window.addEventListener(
      "popstate",
      onPopState,
    );

    return () =>
      window.removeEventListener(
        "popstate",
        onPopState,
      );
  }, []);

  useEffect(() => {
    async function checkHealth() {
      try {
        await requestJson(
          "/api/health",
        );

        setApiOnline(true);
      } catch {
        setApiOnline(false);
      }
    }

    void checkHealth();
  }, []);

  let page: ReactNode;

  switch (path) {
    case "/":
      page = <HomePage />;
      break;

    case "/app":
      page = <ExecutionLabPage />;
      break;

    case "/proof":
      page = <ProofPage />;
      break;

    case "/docs":
      page = <DocsPage />;
      break;

    default:
      page = <NotFoundPage />;
  }

  return (
    <div className="site-shell">
      <SiteHeader
        path={path}
        apiOnline={apiOnline}
      />

      {page}
    </div>
  );
}

export default App;
