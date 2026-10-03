import {
  useMemo,
  useState,
} from "react";

import "./App.css";

type Eip1193Provider = {
  request: (input: {
    method: string;
    params?:
    | unknown[]
    | Record<string, unknown>;
  }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?:
    Eip1193Provider;
  }
}

type PurchaseIntent = {
  supported:
  boolean;

  action:
  "purchase";

  resourceId:
  string | null;

  chainId:
  number;

  network:
  string;

  assetSymbol:
  string;

  maxAmountTbnb:
  string | null;

  needsClarification:
  boolean;

  clarification:
  string | null;
};

type IntentResponse = {
  readyForAuthorization:
  boolean;

  intentId:
  string | null;

  createdAt?:
  number;

  expiresAt?:
  number;

  intent:
  PurchaseIntent;
};

type AuthorizationDraftResponse = {
  authorizationId:
  string;

  intentId:
  string;

  createdAt:
  number;

  draftExpiresAt:
  number;

  expectedSigner:
  string;

  authorization: {
    resourceId:
    string;

    chainId:
    number;

    network:
    string;

    assetType:
    string;

    assetSymbol:
    string;

    maxAmountWei:
    string;

    maxAmountTbnb:
    string;

    trustedSourceId:
    string;

    validUntil:
    number;
  };

  typedData: {
    domain:
    Record<
      string,
      unknown
    >;

    primaryType:
    string;

    types:
    Record<
      string,
      unknown
    >;

    message:
    Record<
      string,
      unknown
    >;
  };
};

type ConfirmedAuthorization = {
  confirmed:
  true;

  authorizationId:
  string;

  intentId:
  string;

  confirmedAt:
  number;

  signer:
  string;

  authorization: {
    resourceId:
    string;

    chainId:
    number;

    assetType:
    string;

    assetSymbol:
    string;

    maxAmountWei:
    string;

    maxAmountTbnb:
    string;

    trustedSourceId:
    string;

    validUntil:
    number;
  };
};

type RawNativeTransaction = {
  chainId:
  number;

  to:
  string;

  valueWei:
  string;

  data:
  string;
};

type VerificationFinding = {
  code:
  string;

  message:
  string;
};

type Verification = {
  decision:
  "ALLOW" |
  "BLOCK" |
  "NEEDS_REAUTHORIZATION";

  findings:
  VerificationFinding[];
};

type Comparison = {
  recipient: {
    expected:
    string;

    actual:
    string;

    matches:
    boolean;
  };

  amount: {
    expectedWei:
    string;

    actualWei:
    string;

    matches:
    boolean;
  };

  chain: {
    expected:
    number;

    actual:
    number;

    matches:
    boolean;
  };

  calldata: {
    expected:
    string;

    actual:
    string;

    matches:
    boolean;
  };
};

type AgentActivity = {
  step:
  string;

  message:
  string;
};

type ContextMutation = {
  field:
  "recipient";

  signedValue:
  string;

  modelVisibleValue:
  string;
};

type AgentRunResponse =
  | {
    status:
    "NO_PROPOSAL";

    sessionCreated:
    false;

    agent: {
      status:
      "NO_PROPOSAL";

      model:
      string;

      task:
      string;

      message:
      string;

      quote:
      unknown;

      activity:
      AgentActivity[];

      contextMutation?:
      ContextMutation;
    };
  }
  | {
    status:
    "SESSION_CREATED";

    sessionCreated:
    true;

    sessionId:
    string;

    createdAt:
    number;

    expiresAt:
    number;

    authorization: {
      signatureScheme:
      string;

      signer:
      string;

      authorizationId:
      string;

      resourceId:
      string;

      chainId:
      number;

      assetType:
      string;

      assetSymbol:
      string;

      maxAmountWei:
      string;

      maxAmountTbnb:
      string;

      trustedSourceId:
      string;

      validUntil:
      number;
    };

    evidence: {
      signatureScheme:
      string;

      evidenceId:
      string;

      sourceId:
      string;

      resourceId:
      string;

      chainId:
      number;

      assetType:
      string;

      assetSymbol:
      string;

      recipient:
      string;

      amountWei:
      string;

      amountTbnb:
      string;

      nonce:
      string;

      issuedAt:
      number;

      expiresAt:
      number;
    };

    transaction:
    RawNativeTransaction;

    verification:
    Verification;

    comparison:
    Comparison;

    signerInvoked:
    false;

    broadcast:
    false;

    agent: {
      status:
      "PROPOSED";

      model:
      string;

      task:
      string;

      activity:
      AgentActivity[];

      proposal: {
        chainId:
        number;

        recipient:
        string;

        valueWei:
        string;

        data:
        string;
      };

      contextMutation?:
      ContextMutation;
    };
  };

type VerifyResponse = {
  sessionId:
  string;

  verification:
  Verification;

  comparison:
  Comparison;

  signerInvoked:
  false;

  broadcast:
  false;
};

type ReplayResponse = {
  sessionId:
  string;

  verification:
  Verification;

  firstGate:
  {
    decision:
    string;

    findings?:
    VerificationFinding[];
  };

  secondGate:
  {
    decision:
    string;

    findings?:
    VerificationFinding[];
  };

  signerInvoked:
  false;

  broadcast:
  false;

  note:
  string;
};

type ApiErrorBody = {
  error?:
  string;

  message?:
  string;
};

type Scenario =
  | "normal"
  | "poisoned";

const API_BASE =
  import.meta.env
    .VITE_BOUND_API_URL ??
  "http://127.0.0.1:8791";

const BSC_TESTNET_CHAIN_ID =
  "0x61";

const BSC_TESTNET_RPC =
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545/";

const BSC_TESTNET_EXPLORER =
  "https://testnet.bscscan.com";

const PROOF_TRANSACTION =
  "0x611eb86dd76f5879873a07065429d7a999fbd046a15c3327cc4ecf99b55cb675";

const ATTACK_RECIPIENT =
  "0x2222222222222222222222222222222222222222";

const ALTERED_AMOUNT_WEI =
  "4321000000000000";

async function apiRequest<T>(
  path:
    string,
  options?: {
    method?:
    "GET" |
    "POST";

    body?:
    unknown;
  }
): Promise<T> {
  const response =
    await fetch(
      `${API_BASE}${path}`,
      {
        method:
          options?.method ??
          "GET",

        headers:
          options?.body !==
            undefined
            ? {
              "content-type":
                "application/json",
            }
            : undefined,

        body:
          options?.body !==
            undefined
            ? JSON.stringify(
              options.body
            )
            : undefined,
      }
    );

  const body =
    await response.json() as
    T &
    ApiErrorBody;

  if (
    !response.ok
  ) {
    throw new Error(
      body.message ??
      body.error ??
      `BOUND API returned HTTP ${response.status}.`
    );
  }

  return body;
}

function formatAddress(
  value:
    string | null |
    undefined
) {
  if (
    !value
  ) {
    return "—";
  }

  if (
    value.length <=
    16
  ) {
    return value;
  }

  return `${value.slice(
    0,
    8
  )}…${value.slice(
    -6
  )}`;
}

function formatTimestamp(
  value:
    number | null |
    undefined
) {
  if (
    !value
  ) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleTimeString(
    [],
    {
      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit",
    }
  );
}

function formatWei(
  raw:
    string
) {
  try {
    const value =
      BigInt(
        raw
      );

    const whole =
      value /
      10n ** 18n;

    const fraction =
      (
        value %
        10n ** 18n
      )
        .toString()
        .padStart(
          18,
          "0"
        )
        .replace(
          /0+$/,
          ""
        );

    return fraction
      ? `${whole}.${fraction}`
      : whole.toString();
  } catch {
    return raw;
  }
}

function getErrorMessage(
  error:
    unknown
) {
  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return String(
    error
  );
}

function getProvider() {
  const provider =
    window.ethereum;

  if (
    !provider
  ) {
    throw new Error(
      "No EVM wallet was detected. Install or enable MetaMask or Rabby."
    );
  }

  return provider;
}

async function ensureBscTestnet(
  provider:
    Eip1193Provider
) {
  try {
    await provider.request({
      method:
        "wallet_switchEthereumChain",

      params: [
        {
          chainId:
            BSC_TESTNET_CHAIN_ID,
        },
      ],
    });
  } catch (
  error
  ) {
    const walletError =
      error as {
        code?:
        number;
      };

    if (
      walletError.code !==
      4902
    ) {
      throw error;
    }

    await provider.request({
      method:
        "wallet_addEthereumChain",

      params: [
        {
          chainId:
            BSC_TESTNET_CHAIN_ID,

          chainName:
            "BNB Smart Chain Testnet",

          nativeCurrency: {
            name:
              "Test BNB",

            symbol:
              "tBNB",

            decimals:
              18,
          },

          rpcUrls: [
            BSC_TESTNET_RPC,
          ],

          blockExplorerUrls: [
            BSC_TESTNET_EXPLORER,
          ],
        },
      ],
    });
  }
}

function Nav() {
  return (
    <header className="site-nav">
      <a
        className="brand"
        href="/"
      >
        <span className="brand-mark">
          B
        </span>

        <span>
          BOUND
        </span>
      </a>

      <nav className="nav-links">
        <a href="/app">
          Workspace
        </a>

        <a href="/proof">
          Proof
        </a>

        <a href="/docs">
          Docs
        </a>
      </nav>
    </header>
  );
}

function Shell(
  props: {
    children:
    React.ReactNode;
  }
) {
  return (
    <div className="site-shell">
      <Nav />

      {props.children}

      <footer className="site-footer">
        <span>
          BOUND
        </span>

        <span>
          Context integrity at the signer boundary.
        </span>

        <span>
          BSC Testnet prototype
        </span>
      </footer>
    </div>
  );
}

function HomePage() {
  return (
    <Shell>
      <main className="landing">
        <section className="hero">
          <div className="eyebrow">
            Context integrity for autonomous payments
          </div>

          <h1>
            Secure the moment
            <br />
            between AI intent
            <br />
            and onchain execution.
          </h1>

          <p className="hero-copy">
            BOUND binds what a user
            authorized, what a trusted
            tool signed, and what an AI
            agent actually proposes before
            a signer can act.
          </p>

          <div className="hero-actions">
            <a
              className="button primary"
              href="/app"
            >
              Open workspace
            </a>

            <a
              className="button ghost"
              href="/docs"
            >
              Read trust model
            </a>
          </div>
        </section>

        <section className="principle-grid">
          <article>
            <span className="index">
              01
            </span>

            <h2>
              User mandate
            </h2>

            <p>
              A wallet signs a
              time-bounded EIP-712 spending
              authorization with an explicit
              resource, chain, asset,
              maximum amount, and trusted
              evidence source.
            </p>
          </article>

          <article>
            <span className="index">
              02
            </span>

            <h2>
              Signed evidence
            </h2>

            <p>
              The merchant or tool provides
              independently signed payment
              evidence. BOUND retains the
              original evidence outside
              model control.
            </p>
          </article>

          <article>
            <span className="index">
              03
            </span>

            <h2>
              Exact transaction
            </h2>

            <p>
              Before signing, BOUND checks
              the actual recipient, amount,
              chain, and calldata against
              both authorization and signed
              evidence.
            </p>
          </article>
        </section>
      </main>
    </Shell>
  );
}

function ProofPage() {
  return (
    <Shell>
      <main className="content-page">
        <div className="eyebrow">
          Testnet proof
        </div>

        <h1>
          Public settlement evidence.
        </h1>

        <p className="lead">
          BOUND has executed a guarded
          native tBNB transfer on BNB Smart
          Chain Testnet after authorization,
          evidence, and transaction fields
          matched.
        </p>

        <section className="proof-card">
          <div>
            <span className="field-label">
              Network
            </span>

            <strong>
              BNB Smart Chain Testnet
            </strong>
          </div>

          <div>
            <span className="field-label">
              Chain
            </span>

            <strong>
              97
            </strong>
          </div>

          <div>
            <span className="field-label">
              Transaction
            </span>

            <code>
              {PROOF_TRANSACTION}
            </code>
          </div>

          <a
            className="button primary"
            href={`${BSC_TESTNET_EXPLORER}/tx/${PROOF_TRANSACTION}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect on BscScan
          </a>
        </section>
      </main>
    </Shell>
  );
}

function DocsPage() {
  return (
    <Shell>
      <main className="content-page docs-page">
        <div className="eyebrow">
          Trust model
        </div>

        <h1>
          What BOUND verifies.
        </h1>

        <section className="docs-grid">
          <article>
            <h2>
              Gemini reasons.
            </h2>

            <p>
              Gemini interprets the natural
              language purchasing request,
              invokes the quote tool, checks
              the user's stated conditions,
              and proposes an unsigned
              transaction.
            </p>
          </article>

          <article>
            <h2>
              BOUND decides.
            </h2>

            <p>
              A deterministic verifier
              compares transaction-critical
              fields against the signed user
              mandate and signed upstream
              evidence.
            </p>
          </article>

          <article>
            <h2>
              The signer is downstream.
            </h2>

            <p>
              The AI does not receive a
              private key. A signing boundary
              can act only after BOUND
              returns an ALLOW decision.
            </p>
          </article>

          <article>
            <h2>
              Scope is explicit.
            </h2>

            <p>
              BOUND verifies provenance and
              consistency. It does not prove
              that a trusted source itself is
              honest, detect every scam, or
              prevent every form of prompt
              injection.
            </p>
          </article>
        </section>
      </main>
    </Shell>
  );
}

function WorkspacePage() {
  const [
    task,
    setTask,
  ] =
    useState(
      "Buy the BNB market report if it costs no more than 0.005 tBNB."
    );

  const [
    wallet,
    setWallet,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    intent,
    setIntent,
  ] =
    useState<
      IntentResponse |
      null
    >(
      null
    );

  const [
    draft,
    setDraft,
  ] =
    useState<
      AuthorizationDraftResponse |
      null
    >(
      null
    );

  const [
    authorization,
    setAuthorization,
  ] =
    useState<
      ConfirmedAuthorization |
      null
    >(
      null
    );

  const [
    agentRun,
    setAgentRun,
  ] =
    useState<
      AgentRunResponse |
      null
    >(
      null
    );

  const [
    candidate,
    setCandidate,
  ] =
    useState<
      RawNativeTransaction |
      null
    >(
      null
    );

  const [
    verification,
    setVerification,
  ] =
    useState<
      VerifyResponse |
      null
    >(
      null
    );

  const [
    replay,
    setReplay,
  ] =
    useState<
      ReplayResponse |
      null
    >(
      null
    );

  const [
    scenario,
    setScenario,
  ] =
    useState<Scenario>(
      "normal"
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const agentSession =
    agentRun &&
      agentRun.status ===
      "SESSION_CREATED"
      ? agentRun
      : null;

  const decision =
    verification
      ?.verification
      .decision ??
    agentSession
      ?.verification
      .decision ??
    null;

  const activity =
    agentRun
      ?.agent
      .activity ??
    [];

  const progress =
    useMemo(
      () => [
        {
          label:
            "Intent",
          complete:
            Boolean(
              intent
            ),
        },

        {
          label:
            "Wallet",
          complete:
            Boolean(
              wallet
            ),
        },

        {
          label:
            "Authorization",
          complete:
            Boolean(
              authorization
            ),
        },

        {
          label:
            "Agent",
          complete:
            Boolean(
              agentRun
            ),
        },

        {
          label:
            "BOUND",
          complete:
            Boolean(
              decision
            ),
        },
      ],
      [
        intent,
        wallet,
        authorization,
        agentRun,
        decision,
      ]
    );

  function resetAfterTask() {
    setIntent(
      null
    );

    setDraft(
      null
    );

    setAuthorization(
      null
    );

    setAgentRun(
      null
    );

    setCandidate(
      null
    );

    setVerification(
      null
    );

    setReplay(
      null
    );

    setError(
      null
    );
  }

  function changeTask(
    value:
      string
  ) {
    setTask(
      value
    );

    resetAfterTask();
  }

  async function submitIntent() {
    setBusy(
      "intent"
    );

    setError(
      null
    );

    try {
      const result =
        await apiRequest<
          IntentResponse
        >(
          "/api/intent",
          {
            method:
              "POST",

            body: {
              task,
            },
          }
        );

      setIntent(
        result
      );

      setDraft(
        null
      );

      setAuthorization(
        null
      );

      setAgentRun(
        null
      );

      setCandidate(
        null
      );

      setVerification(
        null
      );

      setReplay(
        null
      );
    } catch (
    nextError
    ) {
      setError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function connectWallet() {
    setBusy(
      "wallet"
    );

    setError(
      null
    );

    try {
      const provider =
        getProvider();

      const result =
        await provider.request({
          method:
            "eth_requestAccounts",
        });

      const accounts =
        result as
        string[];

      const account =
        accounts[0];

      if (
        !account
      ) {
        throw new Error(
          "The wallet returned no account."
        );
      }

      await ensureBscTestnet(
        provider
      );

      setWallet(
        account
      );

      setDraft(
        null
      );

      setAuthorization(
        null
      );

      setAgentRun(
        null
      );

      setCandidate(
        null
      );

      setVerification(
        null
      );

      setReplay(
        null
      );
    } catch (
    nextError
    ) {
      setError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function createDraft() {
    if (
      !intent?.intentId
    ) {
      setError(
        "Submit a valid purchasing intent first."
      );

      return;
    }

    if (
      !wallet
    ) {
      setError(
        "Connect the wallet that will authorize this purchase."
      );

      return;
    }

    setBusy(
      "draft"
    );

    setError(
      null
    );

    try {
      const result =
        await apiRequest<
          AuthorizationDraftResponse
        >(
          "/api/authorization/draft",
          {
            method:
              "POST",

            body: {
              intentId:
                intent.intentId,

              walletAddress:
                wallet,
            },
          }
        );

      setDraft(
        result
      );

      setAuthorization(
        null
      );

      setAgentRun(
        null
      );

      setCandidate(
        null
      );

      setVerification(
        null
      );

      setReplay(
        null
      );
    } catch (
    nextError
    ) {
      setError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function signAuthorization() {
    if (
      !draft
    ) {
      setError(
        "Create an authorization draft first."
      );

      return;
    }

    if (
      !wallet
    ) {
      setError(
        "Connect your wallet first."
      );

      return;
    }

    setBusy(
      "signature"
    );

    setError(
      null
    );

    try {
      const provider =
        getProvider();

      await ensureBscTestnet(
        provider
      );

      const rawSignature =
        await provider.request({
          method:
            "eth_signTypedData_v4",

          params: [
            wallet,
            JSON.stringify(
              draft.typedData
            ),
          ],
        });

      if (
        typeof rawSignature !==
        "string"
      ) {
        throw new Error(
          "The wallet did not return an EIP-712 signature."
        );
      }

      const confirmed =
        await apiRequest<
          ConfirmedAuthorization
        >(
          "/api/authorization/confirm",
          {
            method:
              "POST",

            body: {
              authorizationId:
                draft.authorizationId,

              signature:
                rawSignature,
            },
          }
        );

      setAuthorization(
        confirmed
      );

      setAgentRun(
        null
      );

      setCandidate(
        null
      );

      setVerification(
        null
      );

      setReplay(
        null
      );
    } catch (
    nextError
    ) {
      setError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function runAgent() {
    if (
      !authorization
    ) {
      setError(
        "Sign the wallet authorization before running the agent."
      );

      return;
    }

    setBusy(
      "agent"
    );

    setError(
      null
    );

    setVerification(
      null
    );

    setReplay(
      null
    );

    try {
      const result =
        await apiRequest<
          AgentRunResponse
        >(
          "/api/agent/run",
          {
            method:
              "POST",

            body: {
              authorizationId:
                authorization
                  .authorizationId,

              scenario,
            },
          }
        );

      setAgentRun(
        result
      );

      if (
        result.status ===
        "SESSION_CREATED"
      ) {
        setCandidate({
          ...result.transaction,
        });
      } else {
        setCandidate(
          null
        );
      }
    } catch (
    nextError
    ) {
      setError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function verifyCandidate() {
    if (
      !agentSession ||
      !candidate
    ) {
      setError(
        "Run the purchasing agent first."
      );

      return;
    }

    setBusy(
      "verify"
    );

    setError(
      null
    );

    try {
      const result =
        await apiRequest<
          VerifyResponse
        >(
          "/api/verify",
          {
            method:
              "POST",

            body: {
              sessionId:
                agentSession
                  .sessionId,

              transaction:
                candidate,
            },
          }
        );

      setVerification(
        result
      );
    } catch (
    nextError
    ) {
      setError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function runReplay() {
    if (
      !agentSession ||
      !candidate
    ) {
      setError(
        "Run the purchasing agent first."
      );

      return;
    }

    setBusy(
      "replay"
    );

    setError(
      null
    );

    try {
      const result =
        await apiRequest<
          ReplayResponse
        >(
          "/api/replay-test",
          {
            method:
              "POST",

            body: {
              sessionId:
                agentSession
                  .sessionId,

              transaction:
                candidate,
            },
          }
        );

      setReplay(
        result
      );
    } catch (
    nextError
    ) {
      setError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  function resetCandidate() {
    if (
      !agentSession
    ) {
      return;
    }

    setCandidate({
      ...agentSession
        .transaction,
    });

    setVerification(
      null
    );

    setReplay(
      null
    );
  }

  function mutateRecipient() {
    if (
      !candidate
    ) {
      return;
    }

    setCandidate({
      ...candidate,

      to:
        ATTACK_RECIPIENT,
    });

    setVerification(
      null
    );

    setReplay(
      null
    );
  }

  function mutateAmount() {
    if (
      !candidate
    ) {
      return;
    }

    setCandidate({
      ...candidate,

      valueWei:
        ALTERED_AMOUNT_WEI,
    });

    setVerification(
      null
    );

    setReplay(
      null
    );
  }

  return (
    <Shell>
      <main className="workspace">
        <section className="workspace-heading">
          <div>
            <div className="eyebrow">
              Controlled AI purchasing
            </div>

            <h1>
              Agent Workspace
            </h1>

            <p>
              Give Gemini a purchasing
              objective. Your wallet defines
              the spending mandate. BOUND
              verifies the exact transaction
              before a signer can act.
            </p>
          </div>

          <div className="network-status">
            <span className="status-dot" />

            BSC Testnet · Chain 97
          </div>
        </section>

        <section className="progress-strip">
          {progress.map(
            (
              item,
              index
            ) => (
              <div
                className={
                  item.complete
                    ? "progress-item complete"
                    : "progress-item"
                }
                key={
                  item.label
                }
              >
                <span>
                  {String(
                    index +
                    1
                  ).padStart(
                    2,
                    "0"
                  )}
                </span>

                {item.label}
              </div>
            )
          )}
        </section>

        {error && (
          <section className="error-banner">
            <strong>
              Request stopped
            </strong>

            <span>
              {error}
            </span>
          </section>
        )}

        <div className="workspace-grid">
          <div className="workspace-main">
            <section className="panel task-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">
                    01 / Intent
                  </span>

                  <h2>
                    What should the agent buy?
                  </h2>
                </div>

                <span className="technical-label">
                  Gemini
                </span>
              </div>

              <textarea
                value={
                  task
                }
                onChange={(
                  event
                ) =>
                  changeTask(
                    event.target
                      .value
                  )
                }
                rows={
                  4
                }
                spellCheck={
                  false
                }
              />

              <div className="action-row">
                <button
                  className="button primary"
                  type="button"
                  onClick={
                    submitIntent
                  }
                  disabled={
                    Boolean(
                      busy
                    ) ||
                    task.trim() ===
                    ""
                  }
                >
                  {busy ===
                    "intent"
                    ? "Gemini is parsing…"
                    : "Parse purchase intent"}
                </button>

                {intent && (
                  <span className="inline-note">
                    {intent
                      .readyForAuthorization
                      ? "Intent is ready for wallet authorization."
                      : intent
                        .intent
                        .clarification ??
                      "More information is required."}
                  </span>
                )}
              </div>

              {intent && (
                <div className="data-grid">
                  <div>
                    <span className="field-label">
                      Resource
                    </span>

                    <strong>
                      {intent
                        .intent
                        .resourceId ??
                        "Unsupported"}
                    </strong>
                  </div>

                  <div>
                    <span className="field-label">
                      Maximum
                    </span>

                    <strong>
                      {intent
                        .intent
                        .maxAmountTbnb ??
                        "—"}{" "}
                      {intent
                        .intent
                        .assetSymbol}
                    </strong>
                  </div>

                  <div>
                    <span className="field-label">
                      Network
                    </span>

                    <strong>
                      {intent
                        .intent
                        .network}
                    </strong>
                  </div>

                  <div>
                    <span className="field-label">
                      Intent ID
                    </span>

                    <code>
                      {intent
                        .intentId ??
                        "—"}
                    </code>
                  </div>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">
                    02 / Authorization
                  </span>

                  <h2>
                    Bind the mandate to your wallet.
                  </h2>
                </div>

                <span className="technical-label">
                  EIP-712
                </span>
              </div>

              <div className="wallet-row">
                <div>
                  <span className="field-label">
                    Owner wallet
                  </span>

                  <strong>
                    {wallet
                      ? formatAddress(
                        wallet
                      )
                      : "Not connected"}
                  </strong>
                </div>

                <button
                  className="button ghost"
                  type="button"
                  onClick={
                    connectWallet
                  }
                  disabled={
                    Boolean(
                      busy
                    )
                  }
                >
                  {busy ===
                    "wallet"
                    ? "Connecting…"
                    : wallet
                      ? "Reconnect wallet"
                      : "Connect MetaMask / Rabby"}
                </button>
              </div>

              {intent
                ?.readyForAuthorization &&
                wallet &&
                !draft &&
                !authorization && (
                  <div className="action-row">
                    <button
                      className="button primary"
                      type="button"
                      onClick={
                        createDraft
                      }
                      disabled={
                        Boolean(
                          busy
                        )
                      }
                    >
                      {busy ===
                        "draft"
                        ? "Creating draft…"
                        : "Review authorization"}
                    </button>
                  </div>
                )}

              {draft &&
                !authorization && (
                  <div className="authorization-review">
                    <div className="data-grid">
                      <div>
                        <span className="field-label">
                          Maximum spend
                        </span>

                        <strong>
                          {draft
                            .authorization
                            .maxAmountTbnb}{" "}
                          tBNB
                        </strong>
                      </div>

                      <div>
                        <span className="field-label">
                          Resource
                        </span>

                        <strong>
                          {draft
                            .authorization
                            .resourceId}
                        </strong>
                      </div>

                      <div>
                        <span className="field-label">
                          Trusted source
                        </span>

                        <strong>
                          {draft
                            .authorization
                            .trustedSourceId}
                        </strong>
                      </div>

                      <div>
                        <span className="field-label">
                          Draft expires
                        </span>

                        <strong>
                          {formatTimestamp(
                            draft
                              .draftExpiresAt
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="signed-boundary">
                      <span>
                        Your wallet signs
                        this exact mandate.
                        No payment transaction
                        is being signed here.
                      </span>

                      <button
                        className="button primary"
                        type="button"
                        onClick={
                          signAuthorization
                        }
                        disabled={
                          Boolean(
                            busy
                          )
                        }
                      >
                        {busy ===
                          "signature"
                          ? "Waiting for wallet…"
                          : "Sign EIP-712 authorization"}
                      </button>
                    </div>
                  </div>
                )}

              {authorization && (
                <div className="success-line">
                  <span className="status-dot" />

                  <div>
                    <strong>
                      Wallet authorization verified
                    </strong>

                    <small>
                      {formatAddress(
                        authorization
                          .signer
                      )}{" "}
                      · max{" "}
                      {authorization
                        .authorization
                        .maxAmountTbnb}{" "}
                      tBNB
                    </small>
                  </div>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">
                    03 / Agent
                  </span>

                  <h2>
                    Let Gemini source the signed quote.
                  </h2>
                </div>

                <span className="technical-label">
                  Function calling
                </span>
              </div>

              <div className="scenario-switch">
                <button
                  type="button"
                  className={
                    scenario ===
                      "normal"
                      ? "scenario-option active"
                      : "scenario-option"
                  }
                  onClick={() =>
                    setScenario(
                      "normal"
                    )
                  }
                >
                  Normal context
                </button>

                <button
                  type="button"
                  className={
                    scenario ===
                      "poisoned"
                      ? "scenario-option active danger"
                      : "scenario-option danger"
                  }
                  onClick={() =>
                    setScenario(
                      "poisoned"
                    )
                  }
                >
                  Controlled context mutation
                </button>
              </div>

              <p className="technical-copy">
                The mutation mode changes
                only the recipient shown to
                Gemini after the signed quote
                reaches the host. The
                original signed evidence is
                retained unchanged for BOUND
                verification.
              </p>

              <div className="action-row">
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    !authorization ||
                    Boolean(
                      busy
                    )
                  }
                  onClick={
                    runAgent
                  }
                >
                  {busy ===
                    "agent"
                    ? "Gemini is working…"
                    : "Run purchasing agent"}
                </button>

                {!authorization && (
                  <span className="inline-note">
                    Wallet authorization is required first.
                  </span>
                )}
              </div>

              {activity.length >
                0 && (
                  <div className="activity-log">
                    {activity.map(
                      (
                        entry,
                        index
                      ) => (
                        <div
                          className="activity-entry"
                          key={`${entry.step}-${index}`}
                        >
                          <span>
                            {String(
                              index +
                              1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </span>

                          <div>
                            <strong>
                              {entry.step}
                            </strong>

                            <p>
                              {entry.message}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

              {agentRun
                ?.status ===
                "NO_PROPOSAL" && (
                  <div className="neutral-result">
                    <strong>
                      No transaction proposed
                    </strong>

                    <p>
                      {agentRun
                        .agent
                        .message}
                    </p>
                  </div>
                )}

              {agentSession
                ?.agent
                .contextMutation && (
                  <div className="mutation-box">
                    <span className="panel-kicker">
                      Controlled mutation
                    </span>

                    <div>
                      <span className="field-label">
                        Signed recipient
                      </span>

                      <code>
                        {agentSession
                          .agent
                          .contextMutation
                          .signedValue}
                      </code>
                    </div>

                    <div>
                      <span className="field-label">
                        Model-visible recipient
                      </span>

                      <code>
                        {agentSession
                          .agent
                          .contextMutation
                          .modelVisibleValue}
                      </code>
                    </div>
                  </div>
                )}
            </section>

            {candidate && (
              <section className="panel transaction-panel">
                <div className="panel-heading">
                  <div>
                    <span className="panel-kicker">
                      04 / Candidate
                    </span>

                    <h2>
                      Inspect the exact transaction.
                    </h2>
                  </div>

                  <span className="technical-label">
                    Unsigned
                  </span>
                </div>

                <div className="transaction-editor">
                  <label>
                    <span>
                      Recipient
                    </span>

                    <input
                      value={
                        candidate.to
                      }
                      onChange={(
                        event
                      ) => {
                        setCandidate({
                          ...candidate,

                          to:
                            event
                              .target
                              .value,
                        });

                        setVerification(
                          null
                        );

                        setReplay(
                          null
                        );
                      }}
                    />
                  </label>

                  <label>
                    <span>
                      Amount · wei
                    </span>

                    <input
                      value={
                        candidate
                          .valueWei
                      }
                      onChange={(
                        event
                      ) => {
                        setCandidate({
                          ...candidate,

                          valueWei:
                            event
                              .target
                              .value,
                        });

                        setVerification(
                          null
                        );

                        setReplay(
                          null
                        );
                      }}
                    />

                    <small>
                      ≈{" "}
                      {formatWei(
                        candidate
                          .valueWei
                      )}{" "}
                      tBNB
                    </small>
                  </label>

                  <label>
                    <span>
                      Chain ID
                    </span>

                    <input
                      type="number"
                      value={
                        candidate
                          .chainId
                      }
                      onChange={(
                        event
                      ) => {
                        setCandidate({
                          ...candidate,

                          chainId:
                            Number(
                              event
                                .target
                                .value
                            ),
                        });

                        setVerification(
                          null
                        );

                        setReplay(
                          null
                        );
                      }}
                    />
                  </label>

                  <label>
                    <span>
                      Calldata
                    </span>

                    <input
                      value={
                        candidate
                          .data
                      }
                      onChange={(
                        event
                      ) => {
                        setCandidate({
                          ...candidate,

                          data:
                            event
                              .target
                              .value,
                        });

                        setVerification(
                          null
                        );

                        setReplay(
                          null
                        );
                      }}
                    />
                  </label>
                </div>

                <div className="attack-shortcuts">
                  <span>
                    Controlled test shortcuts
                  </span>

                  <button
                    type="button"
                    onClick={
                      mutateAmount
                    }
                  >
                    Alter amount
                  </button>

                  <button
                    type="button"
                    onClick={
                      mutateRecipient
                    }
                  >
                    Alter recipient
                  </button>

                  <button
                    type="button"
                    onClick={
                      resetCandidate
                    }
                  >
                    Restore agent proposal
                  </button>
                </div>

                <div className="action-row">
                  <button
                    className="button primary"
                    type="button"
                    disabled={
                      Boolean(
                        busy
                      )
                    }
                    onClick={
                      verifyCandidate
                    }
                  >
                    {busy ===
                      "verify"
                      ? "Verifying…"
                      : "Verify with BOUND"}
                  </button>

                  <button
                    className="button ghost"
                    type="button"
                    disabled={
                      Boolean(
                        busy
                      )
                    }
                    onClick={
                      runReplay
                    }
                  >
                    {busy ===
                      "replay"
                      ? "Testing replay…"
                      : "Exercise replay gate"}
                  </button>
                </div>
              </section>
            )}
          </div>

          <aside className="workspace-side">
            <section className="decision-card">
              <span className="panel-kicker">
                Signer boundary
              </span>

              <div
                className={
                  decision
                    ? `decision ${decision.toLowerCase()}`
                    : "decision waiting"
                }
              >
                {decision ??
                  "WAITING"}
              </div>

              <p>
                ALLOW means the
                authorization, signed
                evidence, and current
                candidate are mutually
                consistent. It is not a
                universal safety claim.
              </p>

              <div className="boundary-status">
                <div>
                  <span>
                    Signer invoked
                  </span>

                  <strong>
                    No
                  </strong>
                </div>

                <div>
                  <span>
                    Broadcast
                  </span>

                  <strong>
                    No
                  </strong>
                </div>
              </div>
            </section>

            {agentSession && (
              <section className="side-card">
                <span className="panel-kicker">
                  Signed evidence
                </span>

                <div className="side-field">
                  <span>
                    Source
                  </span>

                  <strong>
                    {agentSession
                      .evidence
                      .sourceId}
                  </strong>
                </div>

                <div className="side-field">
                  <span>
                    Recipient
                  </span>

                  <code>
                    {formatAddress(
                      agentSession
                        .evidence
                        .recipient
                    )}
                  </code>
                </div>

                <div className="side-field">
                  <span>
                    Signed amount
                  </span>

                  <strong>
                    {agentSession
                      .evidence
                      .amountTbnb}{" "}
                    tBNB
                  </strong>
                </div>

                <div className="side-field">
                  <span>
                    Signature
                  </span>

                  <strong>
                    {agentSession
                      .evidence
                      .signatureScheme}
                  </strong>
                </div>
              </section>
            )}

            {(verification ||
              agentSession) && (
                <section className="side-card">
                  <span className="panel-kicker">
                    Field comparison
                  </span>

                  {Object.entries(
                    (
                      verification ??
                      agentSession
                    )!
                      .comparison
                  ).map(
                    ([
                      key,
                      value,
                    ]) => (
                      <div
                        className="comparison-row"
                        key={
                          key
                        }
                      >
                        <span>
                          {key}
                        </span>

                        <strong
                          className={
                            value.matches
                              ? "match"
                              : "mismatch"
                          }
                        >
                          {value.matches
                            ? "MATCH"
                            : "BREAK"}
                        </strong>
                      </div>
                    )
                  )}
                </section>
              )}

            {(
              verification
                ?.verification ??
              agentSession
                ?.verification
            ) && (
                <section className="side-card findings-card">
                  <span className="panel-kicker">
                    Findings
                  </span>

                  {(
                    verification
                      ?.verification ??
                    agentSession
                      ?.verification
                  )!
                    .findings
                    .map(
                      (
                        finding,
                        index
                      ) => (
                        <div
                          className="finding"
                          key={`${finding.code}-${index}`}
                        >
                          <strong>
                            {finding.code}
                          </strong>

                          <p>
                            {finding.message}
                          </p>
                        </div>
                      )
                    )}
                </section>
              )}

            {replay && (
              <section className="side-card">
                <span className="panel-kicker">
                  Replay gate
                </span>

                <div className="comparison-row">
                  <span>
                    First use
                  </span>

                  <strong>
                    {replay
                      .firstGate
                      .decision}
                  </strong>
                </div>

                <div className="comparison-row">
                  <span>
                    Second use
                  </span>

                  <strong>
                    {replay
                      .secondGate
                      .decision}
                  </strong>
                </div>

                <p className="technical-copy">
                  {replay.note}
                </p>
              </section>
            )}
          </aside>
        </div>
      </main>
    </Shell>
  );
}

function App() {
  const path =
    window.location
      .pathname;

  if (
    path ===
    "/app"
  ) {
    return (
      <WorkspacePage />
    );
  }

  if (
    path ===
    "/proof"
  ) {
    return (
      <ProofPage />
    );
  }

  if (
    path ===
    "/docs"
  ) {
    return (
      <DocsPage />
    );
  }

  return (
    <HomePage />
  );
}

export default App;