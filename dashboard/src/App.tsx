import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import "./App.css";

/*
 * =======================================================
 * WALLET
 * =======================================================
 */

type Eip1193Provider = {
  request: (input: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/*
 * =======================================================
 * API TYPES
 * =======================================================
 */

type Scenario =
  | "normal"
  | "tampered";

type TransactionArguments = {
  chainId: number;
  transactionHash: string;
};

type ToolRequestView = {
  toolId: string;
  method: string;
  arguments: TransactionArguments;
};

type AgentActivity = {
  step: string;
  message: string;
};

type ProposedPlan = {
  status: "PROPOSED";
  planId: string;
  createdAt: number;
  expiresAt: number;
  model: string;
  task: string;
  summary: string;
  network: string;
  request: ToolRequestView;
  requestHash: string;
  activity: AgentActivity[];
};

type NoProposalPlan = {
  status: "NO_PROPOSAL";
  model: string;
  task: string;
  message: string;
  activity: AgentActivity[];
};

type PlanResponse =
  | ProposedPlan
  | NoProposalPlan;

type PaymentPresentation = {
  protocol: string;
  network: string;
  chainId: number;
  token: string;
  tokenContract: string;
  recipient: string;
  amountRaw: string;
  amount: string;
  credentialType: string;

  payer?: string;
  payerSourceDid?: string;
  estimatedGasUnits?: string;
  txHash?: string;
  confirmedBlock?: string;
  explorerUrl?: string;
};

type MppAuthorizationView = {
  authorizationId: string;
  requestHash: string;
  toolId: string;
  method: string;
  chainId: number;
  paymentToken: string;
  paymentRecipient: string;
  maxAmountRaw: string;
  credentialType: "hash";
  validUntil: number;
};

type AuthorizationDraftResponse = {
  authorizationId: string;
  planId: string;
  createdAt: number;
  draftExpiresAt: number;
  expectedSigner: string;

  request: ToolRequestView;
  requestHash: string;

  payment: PaymentPresentation;

  authorization: MppAuthorizationView;

  typedData: {
    domain: Record<string, unknown>;
    primaryType: string;
    types: Record<string, unknown>;
    message: Record<string, unknown>;
  };

  note: string;
};

type ConfirmedAuthorization = {
  confirmed: true;
  authorizationId: string;
  planId: string;
  confirmedAt: number;
  signer: string;

  request: ToolRequestView;
  requestHash: string;

  payment: PaymentPresentation;
  authorization: MppAuthorizationView;

  executionState: string;
};

type VerificationFinding = {
  code: string;
  message: string;

  expected?: unknown;
  actual?: unknown;
};

type BoundVerification = {
  decision:
  | "ALLOW"
  | "BLOCK"
  | "NEEDS_REAUTHORIZATION";

  findings: VerificationFinding[];

  [key: string]:
  unknown;
};

type ExecutionRequestView = {
  authorized: ToolRequestView;
  actual: ToolRequestView;

  authorizedRequestHash: string;
  actualRequestHash: string;

  matches: boolean;
};

type PaymentTermsComparison = {
  sameChain: boolean;
  sameToken: boolean;
  sameRecipient: boolean;
  sameAmount: boolean;
  sameCredentialType: boolean;
};

type ChangeStatus =
  | "SAME"
  | "CHANGED"
  | "WITHIN_AUTHORIZATION";

type WhatChangedReport = {
  version: string;

  decision:
  | "ALLOW"
  | "BLOCK"
  | "NEEDS_REAUTHORIZATION";

  comparison: {
    transaction: ChangeStatus;
    analysisTool: ChangeStatus;
    network: ChangeStatus;
    price: ChangeStatus;
    token: ChangeStatus;
    merchant: ChangeStatus;
    request: ChangeStatus;
  };

  authorized: {
    transactionHash: string;
    requestHash: string;
    toolId: string;
    method: string;
    chainId: number;
    maxAmountRaw: string;
    paymentToken: string;
    paymentRecipient: string;
  };

  actual: {
    transactionHash: string | null;
    requestHash: string;
    toolId: string;
    method: string;
    chainId: number | null;
    amountRaw: string;
    paymentToken: string;
    paymentRecipient: string;
  };

  outcome: {
    title: string;
    message: string;
    paymentStopped: boolean;
    payerInvoked: boolean;
    broadcast: boolean;
  };

  technical: {
    findingCode: string | null;
    authorizedRequestHash: string;
    actualRequestHash: string;
  };
};

type ExecuteResponse = {
  status:
  | "STOPPED"
  | "READY"
  | "COMPLETED"
  | "PAYMENT_BROADCAST_BUT_INCOMPLETE"
  | "EXECUTION_FAILED_BEFORE_PAYMENT";

  scenario: Scenario;
  message: string;

  request?: ExecutionRequestView;

  payment?: PaymentPresentation;

  paymentTerms?: PaymentTermsComparison;

  verification?: BoundVerification;

  whatChanged?: WhatChangedReport;

  signerInvoked?: boolean;
  paymentSimulationInvoked?: boolean;
  paymentBroadcast?: boolean;

  paymentTxHash?:
  | string
  | null;

  payerTokenDeltaRaw?: string;
  merchantTokenDeltaRaw?: string;

  realPaymentEnabled?: boolean;

  receipt?: {
    status: string;
    chainId: number;
    reference: string;
    matchesPaymentTx: boolean;
  };

  toolResult?: {
    source?: string;
    network?: string;
    chainId?: number;
    blockNumber?: string;
    checkedTransaction?: unknown;
    rpcResult?: unknown;
  };

  audit?: {
    signerInvoked: boolean;
    paymentSimulationInvoked: boolean;
    paymentBroadcast: boolean;

    payerTokenDecrease: string;
    merchantTokenIncrease: string;

    tokenSymbol: string;

    payerTbnbBefore: string;
    payerTbnbAfter: string;

    privateKeyPrinted: boolean;
  };

  error?: string;

  explorerUrl?:
  | string
  | null;

  retryAutomatically?: boolean;
};

type PublicConfig = {
  product: string;
  network: string;
  chainId: number;

  tool: {
    id: string;
    method: string;
    name: string;
  };

  payment: {
    protocol: string;
    token: string;
    tokenContract: string;
    recipient: string;
    maximum: string;
    realExecutionEnabled: boolean;
  };

  proof: {
    guardedPaymentTx: string;
    explorerUrl: string;
    note: string;
  };
};

type LensAgentResponse = {
  version: string;

  subject: {
    transactionHash: string;
    network: string;
    chainId: number;
  };

  agent: {
    version: string;

    status:
      | "ANSWERED"
      | "NEEDS_MORE_EVIDENCE";

    answer: string;

    evidence:
      string[];

    limitations:
      string[];

    moreEvidenceNeeded:
      boolean;

    toolNeeded:
      false;

    model:
      string;

    groundedInLensFacts:
      boolean;

    securityDecision:
      false;

    securityVerdictRequested:
      boolean;
  };

  guardPlan:
    | ProposedPlan
    | null;

  runtime: {
    version:
      string;

    status:
      | "ANSWERED"
      | "NEEDS_MORE_EVIDENCE"
      | "PAUSED_FOR_AUTHORIZATION"
      | "MAX_STEPS_REACHED";

    steps:
      number;

    maxSteps:
      number;

    autoPayment:
      false;

    planner:
      | {
          decision:
            | "ANSWER_NOW"
            | "USE_FREE_TOOL"
            | "REQUEST_PAID_TOOL"
            | "NO_SUITABLE_TOOL";

          requiredCapability:
            string;

          selectedTool:
            string |
            null;

          requiresAuthorization:
            boolean;
        }
      | null;

    observations:
      Array<{
        version:
          string;

        toolId:
          string;

        source:
          | "LENS_PIPELINE"
          | "RUNTIME_TOOL";

        status:
          | "COMPLETED"
          | "NOT_APPLICABLE";

        capability:
          string;

        summary:
          string;

        result:
          Record<
            string,
            unknown
          >;
      }>;

    activity:
      Array<{
        step:
          number;

        phase:
          | "REASON"
          | "PLAN"
          | "ACT"
          | "OBSERVE"
          | "PAUSE"
          | "STOP";

        message:
          string;

        toolId?:
          string;
      }>;

    paidRequest:
      ToolRequestView |
      null;
  };

  trust: {
    blockchainFacts:
      "deterministic";

    aiUsedForAnswer:
      true;

    aiUsedForFacts:
      false;

    aiUsedForSecurityDecision:
      false;
  };
};


type TransactionInspectionResponse = {
  version: string;

  input: {
    hash: string;
    source:
      | "transaction_hash"
      | "explorer_url";
    networkHint: {
      id: string;
      name: string;
      chainId: number;
      nativeSymbol: string;
    } | null;
    explorerHost: string | null;
  };

  facts: {
    subject: {
      chainId: number;
      networkId: string;
      network: string;
      nativeSymbol: string;
      transactionHash: string;
      explorerUrl: string;
    };

    transaction: {
      status:
        | "success"
        | "reverted";
      from: string;
      to: string | null;
      blockNumber: string;
      blockTimestamp: string;
      nativeValueWei: string;
      nativeValueFormatted: string;
      nativeSymbol: string;
      transactionFeeWei: string;
      transactionFeeFormatted: string;
      selector: string | null;
    };

    action: {
      type: string;
      selector?: string | null;
    };

    tokenTransfers: Array<{
      token: string;
      symbol: string | null;
      decimals: number | null;
      from: string;
      to: string;
      amountRaw: string;
      amountFormatted: string | null;
    }>;
  };

  interpretation: {
    headline: string;
    plainEnglish: string;

    status:
      | "success"
      | "reverted";

    network: {
      name: string;
      chainId: number;
      nativeSymbol: string;
    };

    interaction: {
      type: string;
      functionName: string | null;
      functionSignature: string | null;
      functionConfidence: string;
      contractAddress: string | null;
      contractName: string | null;
      contractVerified: boolean;
    } | null;

    protocol: {
      status: string;
      name: string | null;
      category: string | null;
      component: string | null;
      confidence: string;
      address: string | null;
      reason: string;
    };

    swap: {
      status: string;
      kind: string | null;

      sent: {
        type:
          | "native"
          | "token";
        address: string | null;
        symbol: string | null;
        amountRaw: string;
        amountFormatted: string;
      } | null;

      received: {
        type:
          | "native"
          | "token";
        address: string | null;
        symbol: string | null;
        amountRaw: string;
        amountFormatted: string;
      } | null;

      summary: string | null;
      reason: string;
      completeAssetFlow: boolean;
    };

    observedWalletEffect: {
      wallet: string;

      tokenEffects: Array<{
        token: string;
        symbol: string | null;
        decimals: number | null;
        direction:
          | "in"
          | "out";
        amountRaw: string;
        amountFormatted: string;
        counterparties: string[];
      }>;

      topLevelNativeSent: {
        amountWei: string;
        amountFormatted: string;
        symbol: string;
      } | null;

      networkFee: {
        amountWei: string;
        amountFormatted: string;
        symbol: string;
      };

      completeNativeNetEffect: boolean;
    };

    whatWeKnow: string[];
    whatWeCannotProve: string[];
  };

  trust: {
    blockchainFacts: "deterministic";
    networkResolution: string;
    verifiedAbiUsed: boolean;
    officialProtocolAbiUsed: boolean;
    aiUsedForFacts: false;
    aiUsedForExplanation: false;
    aiUsedForSecurityDecision: false;
  };
};

type LensTranslationResponse = {
  version: "bound.lens-translation.v1";

  status:
    | "canonical"
    | "translated"
    | "fallback";

  language: string;
  text: string;
  canonicalText: string;
  modelUsed: boolean;
  integrityPreserved: boolean;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
};

/*
 * =======================================================
 * CONSTANTS
 * =======================================================
 */

const API_BASE =
  import.meta.env.VITE_BOUND_API_URL ??
  "http://" + "127.0.0.1:8791";

const BSC_TESTNET_CHAIN_ID =
  "0x61";

const BSC_TESTNET_RPC =
  "https://" + "bsc-testnet-dataseed.bnbchain.org";

const BSC_TESTNET_EXPLORER =
  "https://" + "testnet.bscscan.com";

const GUARDED_PAYMENT_TX =
  "0x4185b1cb8dea410022833f66443230ebda0548178a18f10c92b635b44ee37450";

const SAMPLE_TRANSACTION_HASH =
  GUARDED_PAYMENT_TX;

const CONTROLLED_TAMPER_TRANSACTION_HASH =
  "0x2222222222222222222222222222222222222222222222222222222222222222";

const DEFAULT_TASK =
  `Analyze this BSC Testnet transaction: ${SAMPLE_TRANSACTION_HASH}`;

/*
 * =======================================================
 * API
 * =======================================================
 */

async function apiRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
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

/*
 * =======================================================
 * DISPLAY HELPERS
 * =======================================================
 */

function getErrorMessage(
  error: unknown
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

function formatAddress(
  value:
    | string
    | null
    | undefined
) {
  if (
    !value
  ) {
    return "—";
  }

  if (
    value.length <=
    22
  ) {
    return value;
  }

  return `${value.slice(
    0,
    10
  )}…${value.slice(
    -8
  )}`;
}

function formatHash(
  value:
    | string
    | null
    | undefined
) {
  if (
    !value
  ) {
    return "—";
  }

  if (
    value.length <=
    28
  ) {
    return value;
  }

  return `${value.slice(
    0,
    14
  )}…${value.slice(
    -10
  )}`;
}

function formatTimestamp(
  value:
    | number
    | null
    | undefined
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

function boolLabel(
  value:
    | boolean
    | undefined
) {
  if (
    value ===
    undefined
  ) {
    return "—";
  }

  return value
    ? "YES"
    : "NO";
}

function safeJson(
  value: unknown
) {
  try {
    return JSON.stringify(
      value,
      null,
      2
    );
  } catch {
    return String(
      value
    );
  }
}

/*
 * =======================================================
 * WALLET HELPERS
 * =======================================================
 */

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
        code?: number;
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

async function requestWalletAddress():
  Promise<string> {
  const provider =
    getProvider();

  await ensureBscTestnet(
    provider
  );

  const accounts =
    await provider.request({
      method:
        "eth_requestAccounts",
    });

  if (
    !Array.isArray(
      accounts
    ) ||
    typeof accounts[0] !==
    "string"
  ) {
    throw new Error(
      "The wallet did not return an account."
    );
  }

  return accounts[0];
}

/*
 * =======================================================
 * SMALL UI COMPONENTS
 * =======================================================
 */

function Field(
  props: {
    label: string;
    children: ReactNode;
  }
) {
  return (
    <div>
      <span className="field-label">
        {props.label}
      </span>

      {props.children}
    </div>
  );
}

function SideField(
  props: {
    label: string;
    children: ReactNode;
  }
) {
  return (
    <div className="side-field">
      <span>
        {props.label}
      </span>

      {props.children}
    </div>
  );
}

function ComparisonRow(
  props: {
    label: string;
    value: boolean;
    trueLabel?: string;
    falseLabel?: string;
  }
) {
  return (
    <div className="comparison-row">
      <span>
        {props.label}
      </span>

      <strong
        className={
          props.value
            ? "match"
            : "mismatch"
        }
      >
        {props.value
          ? props.trueLabel ??
          "MATCH"
          : props.falseLabel ??
          "BREAK"}
      </strong>
    </div>
  );
}

/*
 * =======================================================
 * SITE SHELL
 * =======================================================
 */

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
    ReactNode;
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
          Exact-request authorization
          for agent payments.
        </span>

        <span>
          Multi-chain Lens · BSC Testnet Agent prototype
        </span>
      </footer>
    </div>
  );
}

/*
 * =======================================================
 * HOME
 * =======================================================
 */

const LENS_UI_LABELS = {
  transactionIntelligence:
    "Transaction intelligence",

  transactionDecoded:
    "Transaction decoded",

  block:
    "Block",

  success:
    "Success",

  reverted:
    "Reverted",

  sender:
    "Sender",

  originWallet:
    "Origin wallet",

  protocol:
    "Protocol",

  tokenContract:
    "Token contract",

  nativeAsset:
    "Native asset",

  destination:
    "Destination",

  nativeTransfer:
    "Native transfer",

  transferEvent:
    "Transfer event",

  transfer:
    "Transfer",

  observedResult:
    "Observed result",

  received:
    "Received",

  recipient:
    "Recipient",

  walletReceived:
    "Wallet received",

  outcome:
    "Outcome",

  observedSwap:
    "Observed swap",

  nativeToToken:
    "Native to token",

  tokenToToken:
    "Token to token",

  tokenToNative:
    "Token to native",

  receivedLower:
    "received",

  tokenMovementsLower:
    "token movements",

  noOutgoingAsset:
    "No outgoing asset movement",

  noIncomingAsset:
    "No incoming asset movement observed",

  whatHappened:
    "What happened",

  evidenceGrounded:
    "Evidence-grounded interpretation",

  language:
    "Language",

  otherLanguage:
    "Other language…",

  typeAnyLanguage:
    "Type any language",

  apply:
    "Apply",

  translating:
    "Translating…",

  unknownBehavior:
    "Unknown behavior",

  boundWillNotGuess:
    "BOUND will not guess the contract's intent.",

  insufficientEvidence:
    "The available evidence is not enough to identify this contract interaction with confidence.",

  rpcFacts:
    "RPC facts",

  deterministicInterpretation:
    "Deterministic interpretation",

  noSecurityVerdict:
    "No security verdict",

  nativeValue:
    "Native value",

  networkFee:
    "Network fee",

  function:
    "Function",

  tokenMovements:
    "Token movements",

  rawTransaction:
    "Raw transaction",

  analyze:
    "Analyze",

  reading:
    "Reading…",
} as const;

type LensUiKey =
  keyof typeof LENS_UI_LABELS;

function HomePage() {
  const [
    lensLanguage,
    setLensLanguage,
  ] =
    useState(
      "auto"
    );

  const [
    customLensLanguage,
    setCustomLensLanguage,
  ] =
    useState(
      ""
    );

  const [
    translatedExplanation,
    setTranslatedExplanation,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    translationBusy,
    setTranslationBusy,
  ] =
    useState(
      false
    );

  const [
    translationError,
    setTranslationError,
  ] =
    useState<
      string |
      null
    >(
      null
    );


  const [
    transactionInput,
    setTransactionInput,
  ] =
    useState("");

  const [
    inspection,
    setInspection,
  ] =
    useState<
      TransactionInspectionResponse |
      null
    >(
      null
    );

  const [
    inspecting,
    setInspecting,
  ] =
    useState(
      false
    );

  const [
    inspectionError,
    setInspectionError,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    lensAgentQuestion,
    setLensAgentQuestion,
  ] =
    useState("");

  const [
    lensAgentResponse,
    setLensAgentResponse,
  ] =
    useState<
      LensAgentResponse |
      null
    >(
      null
    );

  const [
    lensAgentBusy,
    setLensAgentBusy,
  ] =
    useState(
      false
    );

  const [
    lensAgentError,
    setLensAgentError,
  ] =
    useState<
      string |
      null
    >(
      null
    );


  const [
    ,
    setAgentTask,
  ] =
    useState("");

  const [
    agentWallet,
    setAgentWallet,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    agentPlan,
    setAgentPlan,
  ] =
    useState<
      PlanResponse |
      null
    >(
      null
    );

  const [
    agentDraft,
    setAgentDraft,
  ] =
    useState<
      AuthorizationDraftResponse |
      null
    >(
      null
    );

  const [
    agentAuthorization,
    setAgentAuthorization,
  ] =
    useState<
      ConfirmedAuthorization |
      null
    >(
      null
    );

  const [
    agentScenario,
    setAgentScenario,
  ] =
    useState<Scenario>(
      "normal"
    );

  const [
    agentExecution,
    setAgentExecution,
  ] =
    useState<
      ExecuteResponse |
      null
    >(
      null
    );

  const [
    agentBusy,
    setAgentBusy,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    agentError,
    setAgentError,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    translatedUiLabels,
    setTranslatedUiLabels,
  ] =
    useState<
      Partial<
        Record<
          LensUiKey,
          string
        >
      >
    >(
      {}
    );

  const [
    translatedHeadline,
    setTranslatedHeadline,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    uiTranslationBusy,
    setUiTranslationBusy,
  ] =
    useState(
      false
    );

  function uiLabel(
    key:
      LensUiKey
  ) {
    return (
      translatedUiLabels[
        key
      ] ??
      LENS_UI_LABELS[
        key
      ]
    );
  }

  function swapKindLabel(
    kind:
      string |
      null
  ) {
    if (
      kind ===
      "native_to_token"
    ) {
      return uiLabel(
        "nativeToToken"
      );
    }

    if (
      kind ===
      "token_to_token"
    ) {
      return uiLabel(
        "tokenToToken"
      );
    }

    if (
      kind ===
      "token_to_native"
    ) {
      return uiLabel(
        "tokenToNative"
      );
    }

    return uiLabel(
      "observedSwap"
    );
  }

  function shortAddress(
    value:
      string |
      null |
      undefined
  ) {
    if (
      !value
    ) {
      return "—";
    }

    if (
      value.length <=
      18
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

  function resolveLensLanguage(
    choice:
      string,
    customLanguage:
      string
  ) {
    if (
      choice ===
      "auto"
    ) {
      return (
        navigator.language ||
        "en"
      );
    }

    if (
      choice ===
      "custom"
    ) {
      return customLanguage
        .trim();
    }

    return choice;
  }

  function getTranslationProtectedTerms(
    result:
      TransactionInspectionResponse
  ) {
    const transaction =
      result.facts
        .transaction;

    const candidates = [
      result.facts
        .subject
        .network,

      result.facts
        .subject
        .nativeSymbol,

      result.facts
        .subject
        .transactionHash,

      transaction.from,
      transaction.to,

      result.interpretation
        .network
        .name,

      result.interpretation
        .network
        .nativeSymbol,

      result.interpretation
        .protocol
        .name,

      result.interpretation
        .interaction
        ?.functionName,

      result.interpretation
        .interaction
        ?.functionSignature,

      ...result.facts
        .tokenTransfers
        .flatMap(
          (
            transfer
          ) => [
            transfer.symbol,
            transfer.token,
            transfer.from,
            transfer.to,
          ]
        ),
    ];

    return [
      ...new Set(
        candidates.filter(
          (
            value
          ): value is string =>
            typeof value ===
              "string" &&
            value.length >
              0
        )
      ),
    ].slice(
      0,
      100
    );
  }

  async function translateInspectionExplanation(
    result:
      TransactionInspectionResponse,
    languageChoice:
      string,
    customLanguage:
      string
  ) {
    const targetLanguage =
      resolveLensLanguage(
        languageChoice,
        customLanguage
      );

    const canonicalText =
      result.interpretation
        .plainEnglish;

    if (
      !targetLanguage
    ) {
      setTranslatedExplanation(
        null
      );

      setTranslationError(
        "Enter a language first."
      );

      return;
    }

    if (
      targetLanguage
        .toLowerCase() ===
        "english" ||
      targetLanguage
        .toLowerCase() ===
        "en" ||
      targetLanguage
        .toLowerCase()
        .startsWith(
          "en-"
        )
    ) {
      setTranslatedExplanation(
        canonicalText
      );

      setTranslationError(
        null
      );

      return;
    }

    setTranslationBusy(
      true
    );

    setTranslationError(
      null
    );

    try {
      const translation =
        await apiRequest<
          LensTranslationResponse
        >(
          "/api/translate",
          {
            method:
              "POST",

            body: {
              text:
                canonicalText,

              targetLanguage,

              protectedTerms:
                getTranslationProtectedTerms(
                  result
                ),
            },
          }
        );

      if (
        translation.status ===
        "translated" &&
        translation
          .integrityPreserved
      ) {
        setTranslatedExplanation(
          translation.text
        );

        return;
      }

      setTranslatedExplanation(
        null
      );

      setTranslationError(
        "Translation unavailable — showing canonical English."
      );
    } catch {
      setTranslatedExplanation(
        null
      );

      setTranslationError(
        "Translation unavailable — showing canonical English."
      );
    } finally {
      setTranslationBusy(
        false
      );
    }
  }

  async function translateLensUiLabels(
    result:
      TransactionInspectionResponse,
    languageChoice:
      string,
    customLanguage:
      string
  ) {
    const targetLanguage =
      resolveLensLanguage(
        languageChoice,
        customLanguage
      );

    if (
      !targetLanguage
    ) {
      return;
    }

    const normalizedLanguage =
      targetLanguage
        .trim()
        .toLowerCase();

    if (
      normalizedLanguage ===
        "en" ||
      normalizedLanguage ===
        "english" ||
      normalizedLanguage
        .startsWith(
          "en-"
        )
    ) {
      setTranslatedUiLabels(
        {}
      );

      setTranslatedHeadline(
        null
      );

      return;
    }

    const labelEntries =
      Object.entries(
        LENS_UI_LABELS
      ) as Array<
        [
          LensUiKey,
          string
        ]
      >;

    const entries:
      Array<
        [
          string,
          string
        ]
      > = [
        [
          "headline",
          result
            .interpretation
            .headline,
        ],
        ...labelEntries,
      ];

    const markers =
      entries.map(
        (
          _entry,
          index
        ) =>
          `__BOUND_UI_${index}__`
      );

    const bundle =
      entries
        .map(
          (
            entry,
            index
          ) =>
            `${markers[index]} ${entry[1]}`
        )
        .join(
          "\n"
        );

    setUiTranslationBusy(
      true
    );

    try {
      const protectedTerms = [
        ...markers,
        ...getTranslationProtectedTerms(
          result
        ),
      ].slice(
        0,
        100
      );

      const translation =
        await apiRequest<
          LensTranslationResponse
        >(
          "/api/translate",
          {
            method:
              "POST",

            body: {
              text:
                bundle,

              targetLanguage,

              protectedTerms,
            },
          }
        );

      if (
        translation.status !==
          "translated" ||
        !translation
          .integrityPreserved
      ) {
        setTranslatedUiLabels(
          {}
        );

        setTranslatedHeadline(
          null
        );

        setTranslationError(
          "UI translation unavailable — showing canonical English labels."
        );

        return;
      }

      const translatedValues =
        new Map<
          string,
          string
        >();

      /*
       * Gemini may preserve every protected marker
       * while changing line breaks or marker order.
       *
       * Do not assume markers are returned in the
       * same order as the canonical bundle.
       */
      const locatedMarkers =
        markers.map(
          (
            markerValue,
            index
          ) => ({
            markerValue,
            index,
            position:
              translation.text
                .indexOf(
                  markerValue
                ),
          })
        );

      if (
        locatedMarkers.some(
          (
            item
          ) =>
            item.position ===
            -1
        )
      ) {
        throw new Error(
          "Missing UI translation marker."
        );
      }

      locatedMarkers.sort(
        (
          left,
          right
        ) =>
          left.position -
          right.position
      );

      for (
        let orderIndex = 0;
        orderIndex <
        locatedMarkers.length;
        orderIndex += 1
      ) {
        const current =
          locatedMarkers[
            orderIndex
          ];

        const next =
          locatedMarkers[
            orderIndex + 1
          ];

        const contentStart =
          current.position +
          current.markerValue.length;

        const contentEnd =
          next
            ? next.position
            : translation
                .text
                .length;

        const value =
          translation.text
            .slice(
              contentStart,
              contentEnd
            )
            .trim()
            .replace(
              /^[:\-–—]\s*/,
              ""
            )
            .trim();

        if (
          !value
        ) {
          throw new Error(
            "Empty translated UI label."
          );
        }

        translatedValues.set(
          entries[
            current.index
          ][0],
          value
        );
      }

      const nextUiLabels:
        Partial<
          Record<
            LensUiKey,
            string
          >
        > = {};

      for (
        const [
          key,
        ] of
        labelEntries
      ) {
        const translatedValue =
          translatedValues.get(
            key
          );

        if (
          !translatedValue
        ) {
          throw new Error(
            `Missing translated label: ${key}`
          );
        }

        nextUiLabels[
          key
        ] =
          translatedValue;
      }

      setTranslatedUiLabels(
        nextUiLabels
      );

      setTranslatedHeadline(
        translatedValues.get(
          "headline"
        ) ??
        null
      );
    } catch {
      setTranslatedUiLabels(
        {}
      );

      setTranslatedHeadline(
        null
      );

      setTranslationError(
        "UI translation unavailable — showing canonical English labels."
      );
    } finally {
      setUiTranslationBusy(
        false
      );
    }
  }

  async function inspectTransaction() {
    const input =
      transactionInput
        .trim();

    if (
      !input
    ) {
      setInspectionError(
        "Paste an EVM transaction hash or explorer URL."
      );

      return;
    }

    setInspecting(
      true
    );

    setInspectionError(
      null
    );

    setTranslatedExplanation(
      null
    );

    setTranslatedHeadline(
      null
    );

    setTranslationError(
      null
    );

    try {
      const result =
        await apiRequest<
          TransactionInspectionResponse
        >(
          "/api/inspect",
          {
            method:
              "POST",

            body: {
              input,
            },
          }
        );

      setInspection(
        result
      );

      void translateInspectionExplanation(
        result,
        lensLanguage,
        customLensLanguage
      );

      void translateLensUiLabels(
        result,
        lensLanguage,
        customLensLanguage
      );

      setLensAgentQuestion(
        ""
      );

      setLensAgentResponse(
        null
      );

      setLensAgentError(
        null
      );

      setAgentTask(
        ""
      );

      setAgentPlan(
        null
      );

      setAgentDraft(
        null
      );

      setAgentAuthorization(
        null
      );

      setAgentExecution(
        null
      );

      setAgentScenario(
        "normal"
      );

      setAgentError(
        null
      );
    } catch (
      nextError
    ) {
      setInspectionError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setInspecting(
        false
      );
    }
  }

  async function askInlineLensAgent() {
    const question =
      lensAgentQuestion
        .trim();

    if (
      !inspection
    ) {
      setLensAgentError(
        "Inspect a transaction before asking BOUND Agent."
      );

      return;
    }

    if (
      !question
    ) {
      setLensAgentError(
        "Ask BOUND Agent a question about this transaction."
      );

      return;
    }

    /*
     * Bind the Agent request to the transaction currently
     * displayed by Lens — not to editable browser input.
     */
    const transactionHash =
      inspection
        .facts
        .subject
        .transactionHash;

    setLensAgentBusy(
      true
    );

    setLensAgentError(
      null
    );

    setLensAgentResponse(
      null
    );

    /*
     * A new Agent goal must never inherit a Guard plan,
     * authorization draft, or execution state from an
     * earlier goal.
     */
    setAgentPlan(
      null
    );

    resetInlineAgentAfterPlan();

    setAgentError(
      null
    );

    try {
      const result =
        await apiRequest<
          LensAgentResponse
        >(
          "/api/agent",
          {
            method:
              "POST",

            body: {
              input:
                transactionHash,

              question,
            },
          }
        );

      if (
        result
          .subject
          .transactionHash
          .toLowerCase() !==
        transactionHash
          .toLowerCase()
      ) {
        throw new Error(
          "BOUND Agent returned evidence for a different transaction."
        );
      }

      const runtimePaused =
        result.runtime.status ===
        "PAUSED_FOR_AUTHORIZATION";

      const paidRequest =
        result.runtime.paidRequest;

      const guardPlan =
        result.guardPlan;

      if (
        runtimePaused
      ) {
        if (
          !paidRequest ||
          !guardPlan
        ) {
          throw new Error(
            "BOUND Agent paused for authorization without an exact Guard request."
          );
        }

        const sameRequest =
          paidRequest.toolId ===
            guardPlan.request.toolId &&
          paidRequest.method ===
            guardPlan.request.method &&
          paidRequest.arguments.chainId ===
            guardPlan.request.arguments.chainId &&
          paidRequest.arguments.transactionHash
            .toLowerCase() ===
            guardPlan.request.arguments.transactionHash
              .toLowerCase();

        const sameSubject =
          guardPlan.request.arguments.chainId ===
            result.subject.chainId &&
          guardPlan.request.arguments.transactionHash
            .toLowerCase() ===
            transactionHash.toLowerCase();

        if (
          !sameRequest ||
          !sameSubject
        ) {
          throw new Error(
            "BOUND refused a Guard handoff because the paid request changed."
          );
        }
      } else if (
        paidRequest !==
          null ||
        guardPlan !==
          null
      ) {
        throw new Error(
          "BOUND Agent returned a paid Guard request without pausing for authorization."
        );
      }

      setLensAgentResponse(
        result
      );
    } catch (
      nextError
    ) {
      setLensAgentError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setLensAgentBusy(
        false
      );
    }
  }


  function resetInlineAgentAfterPlan() {
    setAgentDraft(
      null
    );

    setAgentAuthorization(
      null
    );

    setAgentExecution(
      null
    );

    setAgentScenario(
      "normal"
    );
  }

  function reviewRuntimeGuardPlan() {
    const guardPlan =
      lensAgentResponse
        ?.guardPlan;

    if (
      lensAgentResponse
        ?.runtime
        .status !==
        "PAUSED_FOR_AUTHORIZATION" ||
      !guardPlan
    ) {
      setAgentError(
        "No paused Agent request is ready for BOUND Guard."
      );

      return;
    }

    /*
     * Human action crosses the boundary.
     * This does not connect a wallet, sign, execute,
     * or pay. It only selects the exact server-frozen
     * plan for the existing Guard flow.
     */
    resetInlineAgentAfterPlan();

    setAgentPlan(
      guardPlan
    );

    setAgentError(
      null
    );
  }


  async function prepareInlineAuthorization() {
    if (
      agentPlan?.status !==
      "PROPOSED"
    ) {
      setAgentError(
        "Let BOUND Agent plan the exact request first."
      );

      return;
    }

    setAgentBusy(
      "prepare"
    );

    setAgentError(
      null
    );

    setAgentDraft(
      null
    );

    setAgentAuthorization(
      null
    );

    setAgentExecution(
      null
    );

    try {
      let activeWallet =
        agentWallet;

      if (
        !activeWallet
      ) {
        activeWallet =
          await requestWalletAddress();

        setAgentWallet(
          activeWallet
        );
      }

      const result =
        await apiRequest<
          AuthorizationDraftResponse
        >(
          "/api/authorization/prepare",
          {
            method:
              "POST",

            body: {
              planId:
                agentPlan.planId,

              walletAddress:
                activeWallet,
            },
          }
        );

      setAgentDraft(
        result
      );
    } catch (
      nextError
    ) {
      setAgentError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setAgentBusy(
        null
      );
    }
  }

  async function signInlineAuthorization() {
    if (
      !agentDraft
    ) {
      setAgentError(
        "Prepare the authorization first."
      );

      return;
    }

    if (
      !agentWallet
    ) {
      setAgentError(
        "Connect the wallet first."
      );

      return;
    }

    setAgentBusy(
      "sign"
    );

    setAgentError(
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
            agentWallet,
            JSON.stringify(
              agentDraft.typedData
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
                agentDraft.authorizationId,

              signature:
                rawSignature,
            },
          }
        );

      setAgentAuthorization(
        confirmed
      );

      setAgentExecution(
        null
      );
    } catch (
      nextError
    ) {
      setAgentError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setAgentBusy(
        null
      );
    }
  }

  async function verifyInlineBoundary() {
    if (
      !agentAuthorization
    ) {
      setAgentError(
        "Authorize the exact request first."
      );

      return;
    }

    setAgentBusy(
      "verify"
    );

    setAgentError(
      null
    );

    setAgentExecution(
      null
    );

    try {
      const result =
        await apiRequest<
          ExecuteResponse
        >(
          "/api/execute",
          {
            method:
              "POST",

            body: {
              authorizationId:
                agentAuthorization
                  .authorizationId,

              scenario:
                agentScenario,

              confirmRealPayment:
                false,
            },
          }
        );

      setAgentExecution(
        result
      );
    } catch (
      nextError
    ) {
      setAgentError(
        getErrorMessage(
          nextError
        )
      );
    } finally {
      setAgentBusy(
        null
      );
    }
  }

  const canonicalExplanation =
    inspection
      ?.interpretation
      .plainEnglish ??
    null;

  const explanation =
    translatedExplanation ??
    canonicalExplanation;

  const tx =
    inspection
      ?.facts
      .transaction;

  const txHash =
    inspection
      ?.facts
      .subject
      .transactionHash;

  const interpretation =
    inspection
      ?.interpretation;

  const protocol =
    interpretation
      ?.protocol;

  const interaction =
    interpretation
      ?.interaction;

  const identifiedSwap =
    interpretation
      ?.swap
      .status ===
    "identified"
      ? interpretation.swap
      : null;

  const incomingEffect =
    interpretation
      ?.observedWalletEffect
      .tokenEffects
      .find(
        (
          effect
        ) =>
          effect.direction ===
          "in"
      );

  const outgoingEffect =
    interpretation
      ?.observedWalletEffect
      .tokenEffects
      .find(
        (
          effect
        ) =>
          effect.direction ===
          "out"
      );

  const directTokenTransfer =
    !identifiedSwap
      ? inspection
          ?.facts
          .tokenTransfers
          .find(
            (
              transfer
            ) =>
              transfer.from.toLowerCase() ===
              tx?.from.toLowerCase()
          ) ??
        null
      : null;

  const directNativeTransfer =
    !identifiedSwap &&
    inspection
      ?.facts
      .action
      .type ===
      "native_transfer" &&
    tx?.to
      ? tx
      : null;

  const sentDisplay =
    identifiedSwap
      ?.sent
      ? `${identifiedSwap.sent.amountFormatted} ${
          identifiedSwap.sent.symbol ??
          "ASSET"
        }`
      : outgoingEffect
        ? `${outgoingEffect.amountFormatted} ${
            outgoingEffect.symbol ??
            "TOKEN"
          }`
        : interpretation
            ?.observedWalletEffect
            .topLevelNativeSent
          ? `${interpretation.observedWalletEffect.topLevelNativeSent.amountFormatted} ${interpretation.observedWalletEffect.topLevelNativeSent.symbol}`
          : uiLabel(
              "noOutgoingAsset"
            );

  const receivedDisplay =
    identifiedSwap
      ?.received
      ? `${identifiedSwap.received.amountFormatted} ${
          identifiedSwap.received.symbol ??
          "ASSET"
        }`
      : incomingEffect
        ? `${incomingEffect.amountFormatted} ${
            incomingEffect.symbol ??
            "TOKEN"
          }`
        : uiLabel(
            "noIncomingAsset"
          );

  const proposedInlinePlan =
    agentPlan?.status ===
    "PROPOSED"
      ? agentPlan
      : null;

  const runtimeGuardPlan =
    lensAgentResponse
      ?.runtime
      .status ===
      "PAUSED_FOR_AUTHORIZATION"
      ? lensAgentResponse
          .guardPlan
      : null;

  const inlineWhatChanged =
    agentExecution
      ?.whatChanged;

  /*
   * -------------------------------------------------------
   * LANDING STATE
   * -------------------------------------------------------
   */

  if (
    !inspection
  ) {
    return (
      <Shell>
        <main className="lens-entry">
          <section className="lens-entry-inner">
            <div className="eyebrow">
              BOUND · INTENT INTEGRITY FOR AI AGENTS
            </div>

            <h1>
              Let agents act.
              <br />
              Keep money
              <br />
              under control.
            </h1>

            <p>
              BOUND lets AI agents reason and use tools
              autonomously, then freezes the exact paid
              request before money can move.
            </p>

            <div className="bound-product-story">
              <div>
                <span>
                  01 · UNDERSTAND
                </span>

                <strong>
                  BOUND LENS
                </strong>

                <p>
                  Turn real chain evidence into
                  human-readable intent.
                </p>
              </div>

              <div>
                <span>
                  02 · DECIDE
                </span>

                <strong>
                  BOUND AGENT
                </strong>

                <p>
                  Reason, choose tools, observe,
                  and re-plan autonomously.
                </p>
              </div>

              <div>
                <span>
                  03 · AUTHORIZE
                </span>

                <strong>
                  BOUND GUARD
                </strong>

                <p>
                  Freeze paid intent and stop
                  for explicit human approval.
                </p>
              </div>
            </div>

            <div className="bound-thesis">
              <span>
                Autonomy before the boundary.
              </span>

              <strong>
                Deterministic authorization at the boundary.
              </strong>
            </div>

            <form
              className="lens-command"
              onSubmit={
                (
                  event
                ) => {
                  event
                    .preventDefault();

                  void inspectTransaction();
                }
              }
            >
              <span className="lens-command-icon">
                ↳
              </span>

              <input
                aria-label="Transaction"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste transaction hash or explorer URL"
                value={
                  transactionInput
                }
                onChange={
                  (
                    event
                  ) => {
                    setTransactionInput(
                      event
                        .target
                        .value
                    );

                    setInspectionError(
                      null
                    );
                  }
                }
              />

              <button
                type="submit"
                disabled={
                  inspecting ||
                  !transactionInput
                    .trim()
                }
              >
                {inspecting
                  ? "Reading chain…"
                  : "Explain →"}
              </button>
            </form>

            <div className="lens-entry-meta">
              <button
                type="button"
                onClick={
                  () => {
                    setLensLanguage(
                      "English"
                    );

                    setTransactionInput(
                      SAMPLE_TRANSACTION_HASH
                    );
                  }
                }
              >
                Load live demo
              </button>

              <span>
                No wallet required
              </span>

              <span>
                12 supported EVM networks
              </span>
            </div>

            {inspectionError && (
              <div className="lens-error">
                {inspectionError}
              </div>
            )}

            <div className="lens-entry-proof">
              <div>
                <strong>
                  01
                </strong>

                <span>
                  READ
                </span>

                <p>
                  Fetch real chain facts.
                </p>
              </div>

              <div>
                <strong>
                  02
                </strong>

                <span>
                  EXPLAIN
                </span>

                <p>
                  Translate facts without guessing.
                </p>
              </div>

              <div>
                <strong>
                  03
                </strong>

                <span>
                  BIND
                </span>

                <p>
                  Authorize deeper Agent actions exactly.
                </p>
              </div>
            </div>
          </section>
        </main>
      </Shell>
    );
  }

  /*
   * -------------------------------------------------------
   * RESULT / PRODUCT STATE
   * -------------------------------------------------------
   */

  return (
    <Shell>
      <main className="lens-product">
        <section className="lens-toolbar">
          <div>
            <span className="eyebrow">
              BOUND LENS
            </span>

            <strong>
              {uiLabel("transactionIntelligence")}
            </strong>
          </div>

          <form
            className="lens-toolbar-search"
            onSubmit={
              (
                event
              ) => {
                event
                  .preventDefault();

                void inspectTransaction();
              }
            }
          >
            <input
              value={
                transactionInput
              }
              onChange={
                (
                  event
                ) =>
                  setTransactionInput(
                    event
                      .target
                      .value
                  )
              }
            />

            <button
              type="submit"
              disabled={
                inspecting
              }
            >
              {inspecting
                ? uiLabel(
                    "reading"
                  )
                : uiLabel(
                    "analyze"
                  )}
            </button>
          </form>
        </section>

        <section
          className="bound-stage-rail"
          aria-label="BOUND product flow"
        >
          <div className="active">
            <span>
              01
            </span>

            <div>
              <strong>
                BOUND LENS
              </strong>

              <small>
                UNDERSTAND
              </small>
            </div>
          </div>

          <i>
            →
          </i>

          <div
            className={
              lensAgentResponse
                ? "active"
                : ""
            }
          >
            <span>
              02
            </span>

            <div>
              <strong>
                BOUND AGENT
              </strong>

              <small>
                DECIDE
              </small>
            </div>
          </div>

          <i>
            →
          </i>

          <div
            className={
              runtimeGuardPlan ||
              proposedInlinePlan ||
              agentDraft ||
              agentAuthorization ||
              agentExecution
                ? "active guard"
                : ""
            }
          >
            <span>
              03
            </span>

            <div>
              <strong>
                BOUND GUARD
              </strong>

              <small>
                AUTHORIZE
              </small>
            </div>
          </div>
        </section>

        <section className="lens-product-heading">
          <div>
            <div className="lens-kicker">
              {uiLabel("transactionDecoded")}
            </div>

            <h1>
              {
                translatedHeadline ??
                inspection
                  .interpretation
                  .headline
              }
            </h1>

            <span className="lens-hash">
              {txHash}
            </span>
          </div>

          <div className="lens-heading-pills">
            <span className="positive">
              ● {
                uiLabel(
                  tx?.status ===
                  "success"
                    ? "success"
                    : "reverted"
                ).toUpperCase()
              }
            </span>

            <span>
              {
                inspection
                  .interpretation
                  .network
                  .name
              }
            </span>

            <span>
              {uiLabel("block")} {
                tx
                  ?.blockNumber
              }
            </span>
          </div>
        </section>

        <section className="lens-money-flow">
          <div className="lens-money-node">
            <span>
              {uiLabel("sender")}
            </span>

            <strong>
              {
                shortAddress(
                  tx?.from
                )
              }
            </strong>

            <small>
              {uiLabel("originWallet")}
            </small>
          </div>

          <div className="lens-money-route">
            <div className="lens-route-label">
              {sentDisplay}
            </div>

            <div className="lens-route-line">
              <span />
              <i>
                →
              </i>
            </div>

            <small>
              {
                interaction
                  ?.functionName ??
                inspection
                  .facts
                  .action
                  .type
                  .replaceAll(
                    "_",
                    " "
                  )
              }
            </small>
          </div>

          <div className="lens-money-node contract">
            <span>
              {
                protocol
                  ?.status ===
                "identified"
                  ? uiLabel("protocol")
                  : directTokenTransfer
                    ? uiLabel("tokenContract")
                    : directNativeTransfer
                      ? uiLabel("nativeAsset")
                      : uiLabel("destination")
              }
            </span>

            <strong>
              {
                protocol
                  ?.name ??
                directTokenTransfer
                  ?.symbol ??
                (directNativeTransfer
                  ? directNativeTransfer
                      .nativeSymbol
                  : shortAddress(
                      tx?.to
                    ))
              }
            </strong>

            <small>
              {
                protocol
                  ?.component ??
                (directNativeTransfer
                  ? uiLabel("nativeTransfer")
                  : shortAddress(
                      tx?.to
                    ))
              }
            </small>
          </div>

          <div className="lens-money-route secondary">
            <div className="lens-route-label">
              {
                directTokenTransfer
                  ? uiLabel("transferEvent")
                  : directNativeTransfer
                    ? uiLabel("transfer")
                    : uiLabel("observedResult")
              }
            </div>

            <div className="lens-route-line">
              <span />
              <i>
                →
              </i>
            </div>
          </div>

          <div className="lens-money-node recipient">
            <span>
              {
                identifiedSwap
                  ? uiLabel("received")
                  : directTokenTransfer
                    ? uiLabel("recipient")
                    : directNativeTransfer
                      ? uiLabel("recipient")
                      : incomingEffect
                        ? uiLabel("walletReceived")
                        : uiLabel("outcome")
              }
            </span>

            <strong>
              {
                directTokenTransfer
                  ? shortAddress(
                      directTokenTransfer.to
                    )
                  : directNativeTransfer
                    ? shortAddress(
                        directNativeTransfer.to
                      )
                    : receivedDisplay
              }
            </strong>

            <small>
              {
                identifiedSwap
                  ? swapKindLabel(
                      identifiedSwap
                        .kind
                    )
                  : directTokenTransfer
                    ? `${
                        directTokenTransfer.amountFormatted ??
                        directTokenTransfer.amountRaw
                      } ${
                        directTokenTransfer.symbol ??
                        "TOKEN"
                      } ${uiLabel(
                        "receivedLower"
                      )}`
                    : directNativeTransfer
                      ? `${directNativeTransfer.nativeValueFormatted} ${directNativeTransfer.nativeSymbol} ${uiLabel(
                          "receivedLower"
                        )}`
                      : `${inspection.facts.tokenTransfers.length} ${uiLabel(
                          "tokenMovementsLower"
                        )}`
              }
            </small>
          </div>
        </section>

        <section className="lens-main-grid">
          <article className="lens-understand-panel">
            <div className="lens-panel-title">
              <span>
                {uiLabel("whatHappened")}
              </span>

              <small>
                {uiLabel("evidenceGrounded")}
              </small>
            </div>

            <div className="lens-language-row">
              <label>
                <span>
                  {uiLabel("language")}
                </span>

                <select
                  value={
                    lensLanguage
                  }
                  onChange={
                    (
                      event
                    ) => {
                      const nextLanguage =
                        event
                          .target
                          .value;

                      setLensLanguage(
                        nextLanguage
                      );

                      setTranslationError(
                        null
                      );

                      if (
                        nextLanguage ===
                        "custom"
                      ) {
                        setTranslatedExplanation(
                          null
                        );

                        setTranslatedUiLabels(
                          {}
                        );

                        setTranslatedHeadline(
                          null
                        );

                        return;
                      }

                      if (
                        inspection
                      ) {
                        void translateInspectionExplanation(
                          inspection,
                          nextLanguage,
                          customLensLanguage
                        );

                        void translateLensUiLabels(
                          inspection,
                          nextLanguage,
                          customLensLanguage
                        );
                      }
                    }
                  }
                >
                  <option value="auto">
                    Auto
                  </option>

                  <option value="English">
                    English
                  </option>

                  <option value="Bahasa Indonesia">
                    Bahasa Indonesia
                  </option>

                  <option value="Japanese">
                    日本語
                  </option>

                  <option value="Korean">
                    한국어
                  </option>

                  <option value="Arabic">
                    العربية
                  </option>

                  <option value="Spanish">
                    Español
                  </option>

                  <option value="French">
                    Français
                  </option>

                  <option value="German">
                    Deutsch
                  </option>

                  <option value="Portuguese">
                    Português
                  </option>

                  <option value="Chinese">
                    中文
                  </option>

                  <option value="Hindi">
                    हिन्दी
                  </option>

                  <option value="custom">
                    {uiLabel("otherLanguage")}
                  </option>
                </select>
              </label>

              {
                lensLanguage ===
                "custom" &&
                (
                  <div className="lens-custom-language">
                    <input
                      aria-label="Custom language"
                      placeholder={uiLabel("typeAnyLanguage")}
                      value={
                        customLensLanguage
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setCustomLensLanguage(
                            event
                              .target
                              .value
                          )
                      }
                      onKeyDown={
                        (
                          event
                        ) => {
                          if (
                            event.key ===
                            "Enter"
                          ) {
                            event
                              .preventDefault();

                            if (
                              inspection
                            ) {
                              void translateInspectionExplanation(
                                inspection,
                                "custom",
                                customLensLanguage
                              );

                              void translateLensUiLabels(
                                inspection,
                                "custom",
                                customLensLanguage
                              );
                            }
                          }
                        }
                      }
                    />

                    <button
                      type="button"
                      disabled={
                        translationBusy ||
                        !customLensLanguage
                          .trim()
                      }
                      onClick={
                        () => {
                          if (
                            inspection
                          ) {
                            void translateInspectionExplanation(
                              inspection,
                              "custom",
                              customLensLanguage
                            );

                            void translateLensUiLabels(
                              inspection,
                              "custom",
                              customLensLanguage
                            );
                          }
                        }
                      }
                    >
                      {uiLabel("apply")}
                    </button>
                  </div>
                )
              }

              {
                (
                  translationBusy ||
                  uiTranslationBusy
                ) &&
                (
                  <small>
                    {uiLabel("translating")}
                  </small>
                )
              }

              {
                translationError &&
                (
                  <small className="lens-translation-error">
                    {
                      translationError
                    }
                  </small>
                )
              }
            </div>

            <p className="lens-explanation-big">
              {explanation}
            </p>

            {
              inspection
                .facts
                .action
                .type ===
              "contract_call" &&
              protocol
                ?.status !==
              "identified" &&
              !interaction
                ?.functionName &&
              (
                <div className="lens-unknown-panel">
                  <span>
                    {uiLabel("unknownBehavior")}
                  </span>

                  <strong>
                    {uiLabel("boundWillNotGuess")}
                  </strong>

                  <p>
                    {uiLabel("insufficientEvidence")}
                  </p>
                </div>
              )
            }

            <div className="lens-evidence-row">
              <span>
                ✓ {uiLabel("rpcFacts")}
              </span>

              <span>
                ✓ {uiLabel("deterministicInterpretation")}
              </span>

              <span>
                ✓ {uiLabel("noSecurityVerdict")}
              </span>
            </div>
          </article>

          <aside className="lens-agent-console">
            <div className="lens-agent-orb">
              B
            </div>

            <div className="lens-panel-title">
                <span>
                  BOUND AGENT
                </span>

                <small>
                  AUTONOMOUS REASONING
                </small>
              </div>

              <h2>
                Give the Agent a goal.
              </h2>

              <p>
                The Agent reasons over Lens evidence,
                chooses registered tools, observes results,
                and can re-plan. Free tools may run
                autonomously. Paid tools stop at Guard.
              </p>

              <div className="bound-demo-goal">
                <div>
                  <span>
                    LIVE DEMO GOAL
                  </span>

                  <small>
                    Creates a genuine evidence gap.
                    The response is not scripted.
                  </small>
                </div>

                <button
                  type="button"
                  onClick={
                    () => {
                      setLensAgentQuestion(
                        "Obtain the exact raw RPC result returned by the registered paid transaction-analysis provider for this transaction. I need evidence from that paid provider itself, not a summary inferred from the existing Lens facts."
                      );

                      setLensAgentError(
                        null
                      );
                    }
                  }
                >
                  Use paid-evidence goal
                </button>
              </div>

              <textarea
              className="lens-agent-prompt"
              rows={4}
              placeholder="Ask anything about this transaction..."
              value={
                lensAgentQuestion
              }
              onChange={
                (
                  event
                ) => {
                  setLensAgentQuestion(
                    event
                      .target
                      .value
                  );

                  setLensAgentError(
                    null
                  );
                }
              }
            />

            <button
              className="lens-agent-button"
              type="button"
              disabled={
                lensAgentBusy ||
                !lensAgentQuestion
                  .trim()
              }
              onClick={
                () => {
                  void askInlineLensAgent();
                }
              }
            >
              <span>
                {lensAgentBusy
                  ? "BOUND Agent is reasoning…"
                  : "Run Agent"}
              </span>

              <span>
                →
              </span>
            </button>

            {lensAgentError && (
              <div
                className="lens-agent-error"
                role="alert"
              >
                {lensAgentError}
              </div>
            )}

            {lensAgentResponse && (
              <>
                <div className="lens-agent-message">
                  <strong>
                    {lensAgentResponse
                      .agent
                      .status ===
                    "NEEDS_MORE_EVIDENCE"
                      ? "MORE EVIDENCE NEEDED"
                      : "ANSWER"}
                  </strong>

                  <p>
                    {
                      lensAgentResponse
                        .agent
                        .answer
                    }
                  </p>
                </div>

                <div className="lens-agent-review">
                  <div>
                    <span>
                      AGENT RUN
                    </span>

                    <strong>
                      {lensAgentResponse
                        .runtime
                        .status ===
                      "PAUSED_FOR_AUTHORIZATION"
                        ? "PAUSED — HUMAN AUTHORIZATION REQUIRED"
                        : `${lensAgentResponse.runtime.status} · ${lensAgentResponse.runtime.steps}/${lensAgentResponse.runtime.maxSteps} autonomous steps`}
                    </strong>
                  </div>

                  {lensAgentResponse
                    .runtime
                    .activity
                    .map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={
                            `agent-runtime-${index}`
                          }
                        >
                          <span>
                            {item.step ===
                            0
                              ? item.phase
                              : `STEP ${item.step} · ${item.phase}`}
                          </span>

                          <strong>
                            {item.message}
                          </strong>
                        </div>
                      )
                    )}
                </div>

                {lensAgentResponse
                  .runtime
                  .status ===
                  "PAUSED_FOR_AUTHORIZATION" && (
                  <div className="lens-agent-message">
                    <strong>
                      BOUND GUARD REQUIRED
                    </strong>

                    <p>
                      The Agent selected{" "}
                      {lensAgentResponse
                        .runtime
                        .planner
                        ?.selectedTool ===
                      "transaction_analysis_paid"
                        ? "Transaction Analysis"
                        : lensAgentResponse
                            .runtime
                            .planner
                            ?.selectedTool ??
                          "a paid tool"}
                      . Nothing has been authorized,
                      signed, or paid. The exact
                      request is frozen and ready
                      for human review.
                    </p>

                    {lensAgentResponse
                      .guardPlan &&
                      !proposedInlinePlan && (
                      <button
                        className="lens-agent-button"
                        type="button"
                        disabled={
                          agentBusy !==
                          null
                        }
                        onClick={
                          reviewRuntimeGuardPlan
                        }
                      >
                        <span>
                          Review in BOUND Guard
                        </span>

                        <span>
                          →
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {lensAgentResponse
                  .agent
                  .evidence
                  .length >
                  0 && (
                  <div className="lens-agent-review">
                    {lensAgentResponse
                      .agent
                      .evidence
                      .map(
                        (
                          evidence,
                          index
                        ) => (
                          <div
                            key={
                              `agent-evidence-${index}`
                            }
                          >
                            <span>
                              EVIDENCE {
                                index +
                                1
                              }
                            </span>

                            <strong>
                              {evidence}
                            </strong>
                          </div>
                        )
                      )}
                  </div>
                )}

                {lensAgentResponse
                  .agent
                  .limitations
                  .length >
                  0 && (
                  <div className="lens-agent-review">
                    {lensAgentResponse
                      .agent
                      .limitations
                      .map(
                        (
                          limitation,
                          index
                        ) => (
                          <div
                            key={
                              `agent-limitation-${index}`
                            }
                          >
                            <span>
                              LIMITATION {
                                index +
                                1
                              }
                            </span>

                            <strong>
                              {limitation}
                            </strong>
                          </div>
                        )
                      )}
                  </div>
                )}

                <div className="lens-evidence-row">
                  <span>
                    ✓ Deterministic blockchain facts
                  </span>

                  <span>
                    ✓ AI used for answer only
                  </span>

                  <span>
                    ✓ No security verdict
                  </span>
                </div>
              </>
            )}

            <div className="lens-agent-section-divider" />

            <div className="lens-panel-title">
              <span>
                BOUND GUARD
              </span>

              <small>
                HUMAN PAYMENT BOUNDARY
              </small>
            </div>

            {!proposedInlinePlan &&
              !runtimeGuardPlan && (
              <div className="bound-guard-standby">
                <span>
                  GUARD STANDING BY
                </span>

                <strong>
                  No paid action requested.
                </strong>

                <p>
                  BOUND Guard activates only when
                  the Agent selects a paid capability.
                  Until then, no wallet, signature,
                  authorization, or payment is needed.
                </p>
              </div>
            )}

            {agentPlan?.status ===
              "NO_PROPOSAL" && (
              <div className="lens-agent-message danger">
                <strong>
                  Agent needs clarification
                </strong>

                <p>
                  {agentPlan.message}
                </p>

                <button
                  type="button"
                  onClick={
                    () => {
                      setAgentPlan(
                        null
                      );
                    }
                  }
                >
                  Edit request
                </button>
              </div>
            )}

            {proposedInlinePlan &&
              !agentDraft && (
              <>
                <h2>
                  Exact request prepared.
                </h2>

                <p>
                  The Agent proposed one
                  transaction-analysis request.
                  No payment authorization
                  exists yet.
                </p>

                <div className="lens-agent-review">
                  <div>
                    <span>
                      TRANSACTION
                    </span>

                    <code>
                      {
                        shortAddress(
                          proposedInlinePlan
                            .request
                            .arguments
                            .transactionHash
                        )
                      }
                    </code>
                  </div>

                  <div>
                    <span>
                      TOOL
                    </span>

                    <strong>
                      Transaction Analysis
                    </strong>
                  </div>

                  <div>
                    <span>
                      REQUEST HASH
                    </span>

                    <code className="bound-full-hash">
                      {
                        proposedInlinePlan
                          .requestHash
                      }
                    </code>
                  </div>
                </div>

                <button
                  className="lens-agent-button"
                  type="button"
                  disabled={
                    agentBusy !==
                    null
                  }
                  onClick={
                    () => {
                      void prepareInlineAuthorization();
                    }
                  }
                >
                  <span>
                    {agentBusy ===
                    "prepare"
                      ? "Opening wallet…"
                      : "Connect wallet & review"}
                  </span>

                  <span>
                    →
                  </span>
                </button>
              </>
            )}

            {agentDraft &&
              !agentAuthorization && (
              <>
                <h2>
                  Review what your wallet
                  will authorize.
                </h2>

                <div className="lens-agent-review authorization">
                  <div>
                    <span>
                      TRANSACTION
                    </span>

                    <code>
                      {
                        shortAddress(
                          agentDraft
                            .request
                            .arguments
                            .transactionHash
                        )
                      }
                    </code>
                  </div>

                  <div>
                    <span>
                      TOOL
                    </span>

                    <strong>
                      Transaction Analysis
                    </strong>
                  </div>

                  <div>
                    <span>
                      NETWORK
                    </span>

                    <strong>
                      BSC Testnet
                    </strong>
                  </div>

                  <div>
                    <span>
                      MAX PAYMENT
                    </span>

                    <strong>
                      {
                        agentDraft
                          .payment
                          .amount
                      } {
                        agentDraft
                          .payment
                          .token
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      MERCHANT
                    </span>

                    <code>
                      {
                        shortAddress(
                          agentDraft
                            .payment
                            .recipient
                        )
                      }
                    </code>
                  </div>

                  <div>
                    <span>
                      REQUEST HASH
                    </span>

                    <code>
                      {
                        shortAddress(
                          agentDraft
                            .requestHash
                        )
                      }
                    </code>
                  </div>
                </div>

                <button
                  className="lens-agent-button"
                  type="button"
                  disabled={
                    agentBusy !==
                    null
                  }
                  onClick={
                    () => {
                      void signInlineAuthorization();
                    }
                  }
                >
                  <span>
                    {agentBusy ===
                    "sign"
                      ? "Waiting for wallet…"
                      : "Authorize exact request"}
                  </span>

                  <span>
                    →
                  </span>
                </button>

                <small className="lens-auth-note">
                  EIP-712 signature only.
                  This is not an onchain
                  transaction.
                </small>
              </>
            )}

            {agentAuthorization && (
              <>
                <div className="lens-agent-authorized">
                  <span>
                    ✓ AUTHORIZED
                  </span>

                  <strong>
                    Exact request bound
                  </strong>

                  <small>
                    {
                      shortAddress(
                        agentAuthorization
                          .signer
                      )
                    }
                  </small>
                </div>

                <h2>
                  Re-check it at the
                  payment boundary.
                </h2>

                <p>
                  Keep the exact request,
                  or simulate an Agent changing
                  only the transaction after
                  authorization.
                </p>

                <div className="lens-scenario-toggle">
                  <button
                    className={
                      agentScenario ===
                      "normal"
                        ? "active"
                        : ""
                    }
                    type="button"
                    disabled={
                      agentBusy !==
                      null
                    }
                    onClick={
                      () => {
                        setAgentScenario(
                          "normal"
                        );

                        setAgentExecution(
                          null
                        );
                      }
                    }
                  >
                    Exact request
                  </button>

                  <button
                    className={
                      agentScenario ===
                      "tampered"
                        ? "active danger"
                        : "danger"
                    }
                    type="button"
                    disabled={
                      agentBusy !==
                      null
                    }
                    onClick={
                      () => {
                        setAgentScenario(
                          "tampered"
                        );

                        setAgentExecution(
                          null
                        );
                      }
                    }
                  >
                    Change transaction
                  </button>
                </div>

                {agentScenario ===
                  "tampered" && (
                  <div className="lens-mutation-preview">
                    <span>
                      AUTHORIZED
                    </span>

                    <code>
                      {
                        shortAddress(
                          agentAuthorization
                            .request
                            .arguments
                            .transactionHash
                        )
                      }
                    </code>

                    <b>
                      →
                    </b>

                    <span>
                      ACTUAL
                    </span>

                    <code>
                      {
                        shortAddress(
                          CONTROLLED_TAMPER_TRANSACTION_HASH
                        )
                      }
                    </code>
                  </div>
                )}

                <button
                  className="lens-agent-button"
                  type="button"
                  disabled={
                    agentBusy !==
                    null
                  }
                  onClick={
                    () => {
                      void verifyInlineBoundary();
                    }
                  }
                >
                  <span>
                    {agentBusy ===
                    "verify"
                      ? "BOUND is verifying…"
                      : agentScenario ===
                        "tampered"
                        ? "Run changed-request check"
                        : "Verify exact request"}
                  </span>

                  <span>
                    →
                  </span>
                </button>
              </>
            )}

            {agentExecution && (
              <div
                className={
                  agentExecution.status ===
                  "STOPPED"
                    ? "lens-bound-result blocked"
                    : "lens-bound-result allowed"
                }
              >
                <div className="lens-bound-decision">
                  <span>
                    BOUND DECISION
                  </span>

                  <strong>
                    {
                      agentExecution
                        .verification
                        ?.decision ??
                      agentExecution.status
                    }
                  </strong>
                </div>

                {inlineWhatChanged && (
                  <>
                    <h3>
                      {
                        inlineWhatChanged
                          .outcome
                          .title
                      }
                    </h3>

                    <p>
                      {
                        inlineWhatChanged
                          .outcome
                          .message
                      }
                    </p>

                    <div className="lens-comparison">
                      <div>
                        <span>
                          Transaction
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .comparison
                              .transaction
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Tool
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .comparison
                              .analysisTool
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Network
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .comparison
                              .network
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Price
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .comparison
                              .price
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Token
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .comparison
                              .token
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Merchant
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .comparison
                              .merchant
                          }
                        </strong>
                      </div>
                    </div>

                    <div className="lens-payment-proof">
                      <div>
                        <span>
                          PAYER INVOKED
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .outcome
                              .payerInvoked
                              ? "YES"
                              : "NO"
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          PAYMENT BROADCAST
                        </span>

                        <strong>
                          {
                            inlineWhatChanged
                              .outcome
                              .broadcast
                              ? "YES"
                              : "NO"
                          }
                        </strong>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {agentError && (
              <div
                className="lens-agent-error"
                role="alert"
              >
                {agentError}
              </div>
            )}
          </aside>
        </section>

        <section className="lens-detail-strip">
          <div>
            <span>
              {uiLabel("nativeValue")}
            </span>

            <strong>
              {tx?.nativeValueFormatted} {
                tx?.nativeSymbol
              }
            </strong>
          </div>

          <div>
            <span>
              {uiLabel("networkFee")}
            </span>

            <strong>
              {tx?.transactionFeeFormatted} {
                tx?.nativeSymbol
              }
            </strong>
          </div>

          <div>
            <span>
              {uiLabel("function")}
            </span>

            <code>
              {
                interaction
                  ?.functionName ??
                tx?.selector ??
                "NONE"
              }
            </code>
          </div>

          <div>
            <span>
              {uiLabel("tokenMovements")}
            </span>

            <strong>
              {
                inspection
                  .facts
                  .tokenTransfers
                  .length
              }
            </strong>
          </div>

          <a
            href={
              inspection
                .facts
                .subject
                .explorerUrl
            }
            target="_blank"
            rel="noreferrer"
          >
            {uiLabel("rawTransaction")} ↗
          </a>
        </section>

      </main>
    </Shell>
  );
}

/*
 * =======================================================
 * PROOF
 * =======================================================
 */

function ProofPage() {
  return (
    <Shell>
      <main className="content-page">
        <div className="eyebrow">
          Verified testnet evidence
        </div>

        <h1>
          One request paid.
          <br />
          One mutation stopped.
        </h1>

        <p className="lead">
          The exact-request flow completed
          a real BNB MPP payment on BNB
          Smart Chain Testnet. In the
          controlled mutation flow, the
          payment terms remained unchanged
          while the paid tool request
          changed, and BOUND stopped before
          payment.
        </p>

        <section className="proof-card">
          <Field label="Guarded payment">
            <strong>
              0.001 TEST_USDT
            </strong>
          </Field>

          <Field label="Network">
            <strong>
              BNB Smart Chain Testnet · 97
            </strong>
          </Field>

          <Field label="Evidence">
            <strong>
              Historical successful BNB MPP payment
            </strong>
          </Field>

          <Field label="Confirmed payment transaction">
            <code>
              {GUARDED_PAYMENT_TX}
            </code>
          </Field>

          <a
            className="button primary"
            href={`${BSC_TESTNET_EXPLORER}/tx/${GUARDED_PAYMENT_TX}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect on BscScan
          </a>
        </section>

        <section className="proof-card">
          <Field label="Controlled mutation">
            <strong>
              Exact tool argument changed
            </strong>
          </Field>

          <Field label="Authorized transaction">
            <code>
              {SAMPLE_TRANSACTION_HASH}
            </code>
          </Field>

          <Field label="Controlled mutation">
            <code>
              {CONTROLLED_TAMPER_TRANSACTION_HASH}
            </code>
          </Field>

          <Field label="Payment terms">
            <strong>
              Same chain · token ·
              recipient · amount
            </strong>
          </Field>

          <Field label="Result">
            <strong>
              No payment broadcast
            </strong>
          </Field>
        </section>
      </main>
    </Shell>
  );
}

/*
 * =======================================================
 * DOCS
 * =======================================================
 */

function DocsPage() {
  return (
    <Shell>
      <main className="content-page docs-page">
        <div className="eyebrow">
          Architecture & trust boundaries
        </div>

        <h1>
          What BOUND
          <br />
          actually verifies.
        </h1>

        <p className="lead">
          The prototype separates AI
          planning, user authorization,
          deterministic verification, and
          payment execution. Gemini helps
          interpret the task, but it is
          not the payment authority.
        </p>

        <section className="docs-grid">
          <article>
            <h2>
              Gemini plans.
            </h2>

            <p>
              Gemini converts a
              natural-language
              transaction-check task into
              exact from, to, valueWei,
              and calldata fields. Tool
              identity, method, network,
              and chain are pinned by the
              host.
            </p>
          </article>

          <article>
            <h2>
              The wallet authorizes.
            </h2>

            <p>
              The browser wallet signs an
              EIP-712 authorization that
              binds the exact request hash
              to BSC Testnet and the
              quoted MPP payment terms.
            </p>
          </article>

          <article>
            <h2>
              BOUND verifies.
            </h2>

            <p>
              Immediately before payment,
              BOUND recomputes the actual
              tool request and verifies it
              against the signed
              authorization and current
              payment challenge.
            </p>
          </article>

          <article>
            <h2>
              The payer is downstream.
            </h2>

            <p>
              The protected payment wallet
              stays server-side and is not
              exposed to Gemini or the
              browser. Payment execution
              sits after the deterministic
              gate.
            </p>
          </article>

          <article>
            <h2>
              MPP settles.
            </h2>

            <p>
              The paid tool uses a real
              HTTP 402 challenge,
              TEST_USDT on BSC Testnet,
              hash credentials with payer
              provenance, and an MPP
              Payment-Receipt.
            </p>
          </article>

          <article>
            <h2>
              Scope is explicit.
            </h2>

            <p>
              This build demonstrates one
              paid transaction-check tool
              on BSC Testnet. It does not
              claim to stop every form of
              prompt injection or make a
              universal transaction-safety
              judgment.
            </p>
          </article>
        </section>
      </main>
    </Shell>
  );
}

/*
 * =======================================================
 * WORKSPACE
 * =======================================================
 */

function WorkspacePage() {
  const [
    config,
    setConfig,
  ] =
    useState<
      PublicConfig |
      null
    >(
      null
    );

  const [
    task,
    setTask,
  ] =
    useState(
      () => {
        const transactionHash =
          new URLSearchParams(
            window.location.search
          )
            .get(
              "tx"
            )
            ?.trim();

        return transactionHash
          ? `Analyze this BSC Testnet transaction: ${transactionHash}`
          : DEFAULT_TASK;
      }
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
    plan,
    setPlan,
  ] =
    useState<
      PlanResponse |
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
    scenario,
    setScenario,
  ] =
    useState<Scenario>(
      "normal"
    );

  const [
    execution,
    setExecution,
  ] =
    useState<
      ExecuteResponse |
      null
    >(
      null
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

  /*
   * -------------------------------------------------------
   * LOAD PUBLIC PRODUCT CONFIG
   * -------------------------------------------------------
   */

  useEffect(
    () => {
      let mounted =
        true;

      void apiRequest<
        PublicConfig
      >(
        "/api/config"
      )
        .then(
          (
            nextConfig
          ) => {
            if (
              mounted
            ) {
              setConfig(
                nextConfig
              );
            }
          }
        )
        .catch(
          (
            nextError
          ) => {
            if (
              mounted
            ) {
              setError(
                getErrorMessage(
                  nextError
                )
              );
            }
          }
        );

      return () => {
        mounted =
          false;
      };
    },
    []
  );

  const proposedPlan =
    plan?.status ===
      "PROPOSED"
      ? plan
      : null;

  const requestArgs =
    proposedPlan
      ?.request
      .arguments;

  /*
   * -------------------------------------------------------
   * SIDEBAR STATE
   * -------------------------------------------------------
   */

  const statePresentation =
    useMemo(
      () => {
        if (
          execution?.status ===
          "COMPLETED"
        ) {
          return {
            text:
              "TOOL COMPLETED",

            className:
              "allow",

            copy:
              "The exact request matched the signed authorization, the payment completed, and the live tool result was returned.",
          };
        }

        if (
          execution?.status ===
          "STOPPED"
        ) {
          return {
            text:
              "TOOL CALL STOPPED",

            className:
              "block",

            copy:
              execution.message,
          };
        }

        if (
          execution?.status ===
          "READY"
        ) {
          return {
            text:
              "PAYMENT READY",

            className:
              "allow",

            copy:
              "The exact request matches the signed authorization. No payment has been sent.",
          };
        }

        if (
          execution?.status ===
          "PAYMENT_BROADCAST_BUT_INCOMPLETE" ||
          execution?.status ===
          "EXECUTION_FAILED_BEFORE_PAYMENT"
        ) {
          return {
            text:
              "EXECUTION ISSUE",

            className:
              "needs_reauthorization",

            copy:
              execution.message,
          };
        }

        if (
          authorization
        ) {
          return {
            text:
              "AUTHORIZED",

            className:
              "allow",

            copy:
              "Your wallet authorized the exact request and payment terms. The payment boundary has not been evaluated yet.",
          };
        }

        if (
          draft
        ) {
          return {
            text:
              "REVIEW REQUEST",

            className:
              "waiting",

            copy:
              "Review the exact tool request and MPP payment terms before signing.",
          };
        }

        if (
          proposedPlan
        ) {
          return {
            text:
              "REQUEST PLANNED",

            className:
              "waiting",

            copy:
              "The transaction-check request has been canonicalized and hashed. No payment authorization exists yet.",
          };
        }

        return {
          text:
            "WAITING",

          className:
            "waiting",

          copy:
            "Start by describing the exact BSC Testnet transaction you want the paid tool to check.",
        };
      },
      [
        authorization,
        draft,
        execution,
        proposedPlan,
      ]
    );

  const payerSigning =
    execution?.audit
      ?.signerInvoked ??
    execution
      ?.signerInvoked ??
    false;

  const paymentBroadcast =
    execution?.audit
      ?.paymentBroadcast ??
    execution
      ?.paymentBroadcast ??
    Boolean(
      execution
        ?.paymentTxHash
    );

  const progress = {
    request:
      Boolean(
        proposedPlan
      ),

    quote:
      Boolean(
        draft
      ),

    authorization:
      Boolean(
        authorization
      ),

    verification:
      Boolean(
        execution
      ),

    execution:
      execution?.status ===
      "COMPLETED",
  };

  /*
   * -------------------------------------------------------
   * RESET HELPERS
   * -------------------------------------------------------
   */

  function resetAfterTaskChange() {
    setPlan(
      null
    );

    setDraft(
      null
    );

    setAuthorization(
      null
    );

    setExecution(
      null
    );

    setScenario(
      "normal"
    );

    setError(
      null
    );
  }

  function resetAfterPlan() {
    setDraft(
      null
    );

    setAuthorization(
      null
    );

    setExecution(
      null
    );

    setScenario(
      "normal"
    );
  }

  /*
   * -------------------------------------------------------
   * CONNECT WALLET
   * -------------------------------------------------------
   */

  async function connectWallet() {
    setBusy(
      "wallet"
    );

    setError(
      null
    );

    try {
      const address =
        await requestWalletAddress();

      setWallet(
        address
      );

      setDraft(
        null
      );

      setAuthorization(
        null
      );

      setExecution(
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

  /*
   * -------------------------------------------------------
   * STEP 01 — PLAN
   * -------------------------------------------------------
   */

  async function planRequest() {
    if (
      !task.trim()
    ) {
      setError(
        "Enter a transaction-check task first."
      );

      return;
    }

    setBusy(
      "plan"
    );

    setError(
      null
    );

    resetAfterPlan();

    try {
      const result =
        await apiRequest<
          PlanResponse
        >(
          "/api/plan",
          {
            method:
              "POST",

            body: {
              task,
            },
          }
        );

      setPlan(
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

  /*
   * -------------------------------------------------------
   * STEP 02 — FETCH MPP QUOTE + PREPARE EIP-712
   * -------------------------------------------------------
   */

  async function prepareAuthorization() {
    if (
      !proposedPlan
    ) {
      setError(
        "Plan an exact request first."
      );

      return;
    }

    setBusy(
      "prepare"
    );

    setError(
      null
    );

    setDraft(
      null
    );

    setAuthorization(
      null
    );

    setExecution(
      null
    );

    try {
      let activeWallet =
        wallet;

      if (
        !activeWallet
      ) {
        activeWallet =
          await requestWalletAddress();

        setWallet(
          activeWallet
        );
      }

      const result =
        await apiRequest<
          AuthorizationDraftResponse
        >(
          "/api/authorization/prepare",
          {
            method:
              "POST",

            body: {
              planId:
                proposedPlan.planId,

              walletAddress:
                activeWallet,
            },
          }
        );

      setDraft(
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

  /*
   * -------------------------------------------------------
   * STEP 03 — SIGN EIP-712
   * -------------------------------------------------------
   */

  async function signAuthorization() {
    if (
      !draft
    ) {
      setError(
        "Fetch the payment terms first."
      );

      return;
    }

    if (
      !wallet
    ) {
      setError(
        "Connect the wallet first."
      );

      return;
    }

    setBusy(
      "sign"
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

      setExecution(
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

  /*
   * -------------------------------------------------------
   * STEP 04 — VERIFY PAYMENT BOUNDARY
   * -------------------------------------------------------
   */

  async function verifyPaymentBoundary() {
    if (
      !authorization
    ) {
      setError(
        "Authorize the exact request first."
      );

      return;
    }

    setBusy(
      "verify"
    );

    setError(
      null
    );

    setExecution(
      null
    );

    try {
      const result =
        await apiRequest<
          ExecuteResponse
        >(
          "/api/execute",
          {
            method:
              "POST",

            body: {
              authorizationId:
                authorization.authorizationId,

              scenario,

              confirmRealPayment:
                false,
            },
          }
        );

      setExecution(
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

  /*
   * -------------------------------------------------------
   * OPTIONAL REAL TESTNET EXECUTION
   * -------------------------------------------------------
   */

  async function executeRealPayment() {
    if (
      !authorization
    ) {
      setError(
        "Authorize the exact request first."
      );

      return;
    }

    if (
      scenario !==
      "normal"
    ) {
      setError(
        "Real payment is available only for the exact normal request."
      );

      return;
    }

    if (
      !config?.payment
        .realExecutionEnabled
    ) {
      setError(
        "Real payment execution is disabled on the API server."
      );

      return;
    }

    setBusy(
      "execute"
    );

    setError(
      null
    );

    try {
      const result =
        await apiRequest<
          ExecuteResponse
        >(
          "/api/execute",
          {
            method:
              "POST",

            body: {
              authorizationId:
                authorization.authorizationId,

              scenario:
                "normal",

              confirmRealPayment:
                true,
            },
          }
        );

      setExecution(
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

  /*
   * -------------------------------------------------------
   * UI
   * -------------------------------------------------------
   */

  return (
    <Shell>
      <main className="workspace">
        <section className="workspace-heading">
          <div>
            <div className="eyebrow">
              Live request-bound workspace
            </div>

            <h1>
              See exactly what
              <br />
              the agent is
              <br />
              paying for.
            </h1>

            <p>
              Plan a paid transaction-check
              request, authorize that exact
              request with your wallet, then
              let BOUND verify it again at the
              payment boundary.
            </p>
          </div>

          <div className="network-status">
            <span className="status-dot" />

            BSC Testnet · 97
          </div>
        </section>

        <div className="progress-strip">
          <div
            className={
              progress.request
                ? "progress-item complete"
                : "progress-item"
            }
          >
            <span>
              01
            </span>

            Request
          </div>

          <div
            className={
              progress.quote
                ? "progress-item complete"
                : "progress-item"
            }
          >
            <span>
              02
            </span>

            MPP quote
          </div>

          <div
            className={
              progress.authorization
                ? "progress-item complete"
                : "progress-item"
            }
          >
            <span>
              03
            </span>

            Authorize
          </div>

          <div
            className={
              progress.verification
                ? "progress-item complete"
                : "progress-item"
            }
          >
            <span>
              04
            </span>

            Verify
          </div>

          <div
            className={
              progress.execution
                ? "progress-item complete"
                : "progress-item"
            }
          >
            <span>
              05
            </span>

            Execute
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <strong>
              Error
            </strong>

            <span>
              {error}
            </span>
          </div>
        )}

        <div className="workspace-grid">
          <div className="workspace-main">
            {/*
             * =================================================
             * STEP 01
             * =================================================
             */}

            <section className="panel task-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">
                    Step 01
                  </span>

                  <h2>
                    Describe the transaction
                    to check.
                  </h2>
                </div>

                <span className="technical-label">
                  Gemini planning
                </span>
              </div>

              <textarea
                value={task}
                onChange={
                  (
                    event
                  ) => {
                    setTask(
                      event.target.value
                    );

                    resetAfterTaskChange();
                  }
                }
                placeholder="Provide exact from, to, valueWei, and calldata."
              />

              <div className="action-row">
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    busy !==
                    null
                  }
                  onClick={
                    () => {
                      void planRequest();
                    }
                  }
                >
                  {busy ===
                    "plan"
                    ? "Planning…"
                    : "Plan exact request"}
                </button>

                <span className="inline-note">
                  Gemini proposes the
                  transaction fields. BOUND
                  canonicalizes and hashes the
                  exact tool request host-side.
                </span>
              </div>

              {plan?.status ===
                "NO_PROPOSAL" && (
                  <div className="neutral-result">
                    <strong>
                      More information required
                    </strong>

                    <p>
                      {plan.message}
                    </p>
                  </div>
                )}

              {proposedPlan && (
                <>
                  <div className="data-grid">
                    <Field label="Tool">
                      <strong>
                        {proposedPlan
                          .request
                          .toolId}
                      </strong>
                    </Field>

                    <Field label="Method">
                      <strong>
                        {proposedPlan
                          .request
                          .method}
                      </strong>
                    </Field>

                    <Field label="Network">
                      <strong>
                        {proposedPlan
                          .network}
                      </strong>
                    </Field>

                    <Field label="Model">
                      <strong>
                        {proposedPlan
                          .model}
                      </strong>
                    </Field>
                  </div>

                  <div className="transaction-editor">
                    <label>
                      <span>
                        Transaction hash
                      </span>

                      <input
                        readOnly
                        value={
                          requestArgs
                            ?.transactionHash ??
                          ""
                        }
                      />
                    </label>

                    <label>
                      <span>
                        Chain ID
                      </span>

                      <input
                        readOnly
                        value={
                          requestArgs
                            ?.chainId
                            ?.toString() ??
                          ""
                        }
                      />
                    </label>
                  </div>

                  <div className="data-grid">
                    <Field label="Request hash">
                      <code>
                        {proposedPlan
                          .requestHash}
                      </code>
                    </Field>

                    <Field label="Plan expires">
                      <strong>
                        {formatTimestamp(
                          proposedPlan
                            .expiresAt
                        )}
                      </strong>
                    </Field>
                  </div>

                  <div className="activity-log">
                    {proposedPlan
                      .activity
                      .map(
                        (
                          item,
                          index
                        ) => (
                          <div
                            className="activity-entry"
                            key={`${item.step}-${index}`}
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
                                {item.step}
                              </strong>

                              <p>
                                {item.message}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                  </div>
                </>
              )}
            </section>

            {/*
             * =================================================
             * STEP 02 + 03
             * =================================================
             */}

            {proposedPlan && (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="panel-kicker">
                      Step 02
                    </span>

                    <h2>
                      Fetch real payment
                      terms.
                    </h2>
                  </div>

                  <span className="technical-label">
                    HTTP 402 · BNB MPP
                  </span>
                </div>

                <div className="wallet-row">
                  <div>
                    <span className="field-label">
                      Authorization wallet
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
                    disabled={
                      busy !==
                      null
                    }
                    onClick={
                      () => {
                        void connectWallet();
                      }
                    }
                  >
                    {busy ===
                      "wallet"
                      ? "Connecting…"
                      : wallet
                        ? "Reconnect wallet"
                        : "Connect wallet"}
                  </button>
                </div>

                {!draft && (
                  <div className="action-row">
                    <button
                      className="button primary"
                      type="button"
                      disabled={
                        busy !==
                        null
                      }
                      onClick={
                        () => {
                          void prepareAuthorization();
                        }
                      }
                    >
                      {busy ===
                        "prepare"
                        ? "Fetching…"
                        : "Fetch payment terms"}
                    </button>

                    <span className="inline-note">
                      This requests a real
                      MPP HTTP 402 challenge.
                      It does not send a
                      payment.
                    </span>
                  </div>
                )}

                {draft && (
                  <>
                    <div className="data-grid">
                      <Field label="Protocol">
                        <strong>
                          {draft
                            .payment
                            .protocol}
                        </strong>
                      </Field>

                      <Field label="Price">
                        <strong>
                          {draft
                            .payment
                            .amount}{" "}
                          {draft
                            .payment
                            .token}
                        </strong>
                      </Field>

                      <Field label="Payment token">
                        <strong>
                          {draft
                            .payment
                            .token}
                        </strong>
                      </Field>

                      <Field label="Credential">
                        <strong>
                          {draft
                            .payment
                            .credentialType}
                        </strong>
                      </Field>

                      <Field label="Token contract">
                        <code>
                          {draft
                            .payment
                            .tokenContract}
                        </code>
                      </Field>

                      <Field label="Payment recipient">
                        <code>
                          {draft
                            .payment
                            .recipient}
                        </code>
                      </Field>

                      <Field label="Chain">
                        <strong>
                          {draft
                            .payment
                            .chainId}
                        </strong>
                      </Field>

                      <Field label="Draft expires">
                        <strong>
                          {formatTimestamp(
                            draft
                              .draftExpiresAt
                          )}
                        </strong>
                      </Field>
                    </div>

                    <div className="signed-boundary">
                      <div>
                        <span className="field-label">
                          Wallet will authorize
                        </span>

                        <code>
                          {draft
                            .requestHash}
                        </code>
                      </div>

                      <strong>
                        Exact request
                      </strong>
                    </div>

                    <p className="technical-copy">
                      The EIP-712 message
                      binds this exact request
                      hash to chain 97, the
                      quoted TEST_USDT token,
                      payment recipient,
                      maximum amount,
                      credential type, and
                      expiry.
                    </p>

                    {!authorization && (
                      <div className="action-row">
                        <button
                          className="button primary"
                          type="button"
                          disabled={
                            busy !==
                            null
                          }
                          onClick={
                            () => {
                              void signAuthorization();
                            }
                          }
                        >
                          {busy ===
                            "sign"
                            ? "Waiting for wallet…"
                            : "Authorize exact request"}
                        </button>

                        <span className="inline-note">
                          This creates an
                          EIP-712 signature.
                          It is not an
                          onchain transaction.
                        </span>
                      </div>
                    )}

                    {authorization && (
                      <div className="success-line">
                        <div>
                          <strong>
                            Exact request authorized
                          </strong>

                          <small>
                            signer{" "}
                            {formatAddress(
                              authorization
                                .signer
                            )}
                          </small>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/*
             * =================================================
             * STEP 04
             * =================================================
             */}

            {authorization && (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="panel-kicker">
                      Step 03
                    </span>

                    <h2>
                      Re-check at the
                      payment boundary.
                    </h2>
                  </div>

                  <span className="technical-label">
                    Deterministic gate
                  </span>
                </div>

                <div className="scenario-switch">
                  <button
                    className={
                      scenario ===
                        "normal"
                        ? "scenario-option active"
                        : "scenario-option"
                    }
                    type="button"
                    disabled={
                      busy !==
                      null
                    }
                    onClick={
                      () => {
                        setScenario(
                          "normal"
                        );

                        setExecution(
                          null
                        );
                      }
                    }
                  >
                    Exact request
                  </button>

                  <button
                    className={
                      scenario ===
                        "tampered"
                        ? "scenario-option active danger"
                        : "scenario-option danger"
                    }
                    type="button"
                    disabled={
                      busy !==
                      null
                    }
                    onClick={
                      () => {
                        setScenario(
                          "tampered"
                        );

                        setExecution(
                          null
                        );
                      }
                    }
                  >
                    Controlled mutation
                  </button>
                </div>

                <p className="technical-copy">
                  {scenario ===
                    "normal"
                    ? "The actual request reaching the payment boundary remains identical to the request your wallet authorized."
                    : "The paid tool request is changed after authorization while the MPP chain, token, merchant, amount, and credential type remain unchanged."}
                </p>

                {scenario ===
                  "tampered" && (
                    <div className="mutation-box">
                      <div>
                        <span className="field-label">
                          Authorized transaction
                        </span>

                        <code>
                          {requestArgs
                            ?.transactionHash ??
                            "—"}
                        </code>
                      </div>

                      <div>
                        <span className="field-label">
                          Model-visible actual transaction
                        </span>

                        <code>
                          {CONTROLLED_TAMPER_TRANSACTION_HASH}
                        </code>
                      </div>
                    </div>
                  )}

                <div className="action-row">
                  <button
                    className="button primary"
                    type="button"
                    disabled={
                      busy !==
                      null
                    }
                    onClick={
                      () => {
                        void verifyPaymentBoundary();
                      }
                    }
                  >
                    {busy ===
                      "verify"
                      ? "Verifying…"
                      : scenario ===
                        "tampered"
                        ? "Run mutation check"
                        : "Check payment boundary"}
                  </button>

                  <span className="inline-note">
                    This verifies the
                    request without asking
                    the protected payer to
                    send money.
                  </span>
                </div>

                {execution && (
                  <>
                    {execution.status ===
                      "READY" && (
                        <div className="neutral-result">
                          <strong>
                            Payment ready
                          </strong>

                          <p>
                            {execution.message}
                          </p>
                        </div>
                      )}

                    {execution.status ===
                      "STOPPED" && (
                        <div className="mutation-box">
                          <div>
                            <span className="field-label">
                              Paid tool call stopped
                            </span>

                            <strong>
                              {execution.message}
                            </strong>
                          </div>

                          <div>
                            <span className="field-label">
                              Payment transaction
                            </span>

                            <code>
                              none
                            </code>
                          </div>
                        </div>
                      )}

                    {execution.status ===
                      "COMPLETED" && (
                        <div className="success-line">
                          <div>
                            <strong>
                              Tool completed
                            </strong>

                            <small>
                              real MPP payment ·
                              live BSC Testnet RPC
                            </small>
                          </div>
                        </div>
                      )}

                    {(execution.status ===
                      "PAYMENT_BROADCAST_BUT_INCOMPLETE" ||
                      execution.status ===
                      "EXECUTION_FAILED_BEFORE_PAYMENT") && (
                        <div className="error-banner">
                          <strong>
                            Execution issue
                          </strong>

                          <span>
                            {execution.error ??
                              execution.message}
                          </span>
                        </div>
                      )}

                    {execution.whatChanged && (
                      <section className="proof-card">
                        <div className="eyebrow">
                          What Changed?
                        </div>

                        <h2>
                          {execution.whatChanged.outcome.title}
                        </h2>

                        <p className="technical-copy">
                          {execution.whatChanged.outcome.message}
                        </p>

                        <div className="activity-log">
                          <ComparisonRow
                            label="Transaction"
                            value={
                              execution.whatChanged
                                .comparison.transaction !==
                              "CHANGED"
                            }
                            trueLabel={
                              execution.whatChanged
                                .comparison.transaction
                            }
                            falseLabel="CHANGED"
                          />

                          <ComparisonRow
                            label="Tool"
                            value={
                              execution.whatChanged
                                .comparison.analysisTool !==
                              "CHANGED"
                            }
                            trueLabel={
                              execution.whatChanged
                                .comparison.analysisTool
                            }
                            falseLabel="CHANGED"
                          />

                          <ComparisonRow
                            label="Network"
                            value={
                              execution.whatChanged
                                .comparison.network !==
                              "CHANGED"
                            }
                            trueLabel={
                              execution.whatChanged
                                .comparison.network
                            }
                            falseLabel="CHANGED"
                          />

                          <ComparisonRow
                            label="Price"
                            value={
                              execution.whatChanged
                                .comparison.price !==
                              "CHANGED"
                            }
                            trueLabel={
                              execution.whatChanged
                                .comparison.price
                            }
                            falseLabel="CHANGED"
                          />

                          <ComparisonRow
                            label="Token"
                            value={
                              execution.whatChanged
                                .comparison.token !==
                              "CHANGED"
                            }
                            trueLabel={
                              execution.whatChanged
                                .comparison.token
                            }
                            falseLabel="CHANGED"
                          />

                          <ComparisonRow
                            label="Merchant"
                            value={
                              execution.whatChanged
                                .comparison.merchant !==
                              "CHANGED"
                            }
                            trueLabel={
                              execution.whatChanged
                                .comparison.merchant
                            }
                            falseLabel="CHANGED"
                          />
                        </div>

                        <div className="data-grid">
                          <Field label="Payment">
                            <strong
                              className={
                                execution.whatChanged
                                  .outcome.paymentStopped
                                  ? "mismatch"
                                  : "match"
                              }
                            >
                              {execution.whatChanged
                                .outcome.paymentStopped
                                ? "STOPPED"
                                : execution.whatChanged
                                    .outcome.broadcast
                                  ? "BROADCAST"
                                  : "NOT SENT"}
                            </strong>
                          </Field>

                          <Field label="Protected payer">
                            <strong
                              className={
                                execution.whatChanged
                                  .outcome.payerInvoked
                                  ? "mismatch"
                                  : "match"
                              }
                            >
                              {execution.whatChanged
                                .outcome.payerInvoked
                                ? "INVOKED"
                                : "NOT INVOKED"}
                            </strong>
                          </Field>

                          <Field label="Payment broadcast">
                            <strong
                              className={
                                execution.whatChanged
                                  .outcome.broadcast
                                  ? "mismatch"
                                  : "match"
                              }
                            >
                              {execution.whatChanged
                                .outcome.broadcast
                                ? "YES"
                                : "NO"}
                            </strong>
                          </Field>
                        </div>

                        <details>
                          <summary>
                            Technical details
                          </summary>

                          <div className="data-grid">
                            <Field label="Finding">
                              <code>
                                {execution.whatChanged
                                  .technical.findingCode ??
                                  "—"}
                              </code>
                            </Field>

                            <Field label="Authorized transaction">
                              <code>
                                {execution.whatChanged
                                  .authorized.transactionHash}
                              </code>
                            </Field>

                            <Field label="Actual transaction">
                              <code>
                                {execution.whatChanged
                                  .actual.transactionHash ??
                                  "—"}
                              </code>
                            </Field>

                            <Field label="Authorized request hash">
                              <code>
                                {execution.whatChanged
                                  .technical
                                  .authorizedRequestHash}
                              </code>
                            </Field>

                            <Field label="Actual request hash">
                              <code>
                                {execution.whatChanged
                                  .technical
                                  .actualRequestHash}
                              </code>
                            </Field>
                          </div>
                        </details>
                      </section>
                    )}

                    {!execution.whatChanged && execution.request && (
                      <>
                        <div className="data-grid">
                          <Field label="Authorized hash">
                            <code>
                              {execution
                                .request
                                .authorizedRequestHash}
                            </code>
                          </Field>

                          <Field label="Actual hash">
                            <code>
                              {execution
                                .request
                                .actualRequestHash}
                            </code>
                          </Field>

                          <Field label="Request integrity">
                            <strong
                              className={
                                execution
                                  .request
                                  .matches
                                  ? "match"
                                  : "mismatch"
                              }
                            >
                              {execution
                                .request
                                .matches
                                ? "MATCH"
                                : "BREAK"}
                            </strong>
                          </Field>

                          <Field label="Finding">
                            <strong>
                              {execution
                                .verification
                                ?.findings[0]
                                ?.code ??
                                "—"}
                            </strong>
                          </Field>
                        </div>

                        {scenario ===
                          "tampered" && (
                            <div className="mutation-box">
                              <div>
                                <span className="field-label">
                                  Authorized transaction
                                </span>

                                <code>
                                  {execution
                                    .request
                                    .authorized
                                    .arguments
                                    .transactionHash}
                                </code>
                              </div>

                              <div>
                                <span className="field-label">
                                  Actual transaction
                                </span>

                                <code>
                                  {execution
                                    .request
                                    .actual
                                    .arguments
                                    .transactionHash}
                                </code>
                              </div>
                            </div>
                          )}
                      </>
                    )}

                    {!execution.whatChanged && execution.paymentTerms && (
                      <div className="activity-log">
                        <ComparisonRow
                          label="Chain"
                          value={
                            execution
                              .paymentTerms
                              .sameChain
                          }
                          trueLabel="UNCHANGED"
                          falseLabel="CHANGED"
                        />

                        <ComparisonRow
                          label="Token"
                          value={
                            execution
                              .paymentTerms
                              .sameToken
                          }
                          trueLabel="UNCHANGED"
                          falseLabel="CHANGED"
                        />

                        <ComparisonRow
                          label="Payment recipient"
                          value={
                            execution
                              .paymentTerms
                              .sameRecipient
                          }
                          trueLabel="UNCHANGED"
                          falseLabel="CHANGED"
                        />

                        <ComparisonRow
                          label="Amount"
                          value={
                            execution
                              .paymentTerms
                              .sameAmount
                          }
                          trueLabel="UNCHANGED"
                          falseLabel="CHANGED"
                        />

                        <ComparisonRow
                          label="Credential type"
                          value={
                            execution
                              .paymentTerms
                              .sameCredentialType
                          }
                          trueLabel="UNCHANGED"
                          falseLabel="CHANGED"
                        />
                      </div>
                    )}

                    {execution.status ===
                      "READY" && (
                        <>
                          {config?.payment
                            .realExecutionEnabled
                            ? (
                              <div className="action-row">
                                <button
                                  className="button primary"
                                  type="button"
                                  disabled={
                                    busy !==
                                    null
                                  }
                                  onClick={
                                    () => {
                                      void executeRealPayment();
                                    }
                                  }
                                >
                                  {busy ===
                                    "execute"
                                    ? "Executing…"
                                    : "Execute real testnet payment"}
                                </button>

                                <span className="inline-note">
                                  This sends a
                                  real 0.001
                                  TEST_USDT
                                  payment on BSC
                                  Testnet.
                                </span>
                              </div>
                            )
                            : (
                              <div className="neutral-result">
                                <strong>
                                  Real payment disabled
                                </strong>

                                <p>
                                  The API is
                                  currently running
                                  in verification-only
                                  mode. No TEST_USDT
                                  can be sent from
                                  this workspace.
                                </p>
                              </div>
                            )}
                        </>
                      )}

                    {execution.status ===
                      "COMPLETED" && (
                        <>
                          <div className="data-grid">
                            <Field label="Payment tx">
                              <code>
                                {execution
                                  .payment
                                  ?.txHash ??
                                  "—"}
                              </code>
                            </Field>

                            <Field label="Confirmed block">
                              <strong>
                                {execution
                                  .payment
                                  ?.confirmedBlock ??
                                  "—"}
                              </strong>
                            </Field>

                            <Field label="Payment receipt">
                              <strong>
                                {execution
                                  .receipt
                                  ?.status ??
                                  "—"}
                              </strong>
                            </Field>

                            <Field label="Receipt matches tx">
                              <strong>
                                {boolLabel(
                                  execution
                                    .receipt
                                    ?.matchesPaymentTx
                                )}
                              </strong>
                            </Field>

                            <Field label="RPC source">
                              <strong>
                                {execution
                                  .toolResult
                                  ?.source ??
                                  "—"}
                              </strong>
                            </Field>

                            <Field label="RPC block">
                              <strong>
                                {execution
                                  .toolResult
                                  ?.blockNumber ??
                                  "—"}
                              </strong>
                            </Field>

                            <Field label="Payer token decrease">
                              <strong>
                                {execution
                                  .audit
                                  ?.payerTokenDecrease ??
                                  "—"}{" "}
                                {execution
                                  .audit
                                  ?.tokenSymbol ??
                                  ""}
                              </strong>
                            </Field>

                            <Field label="Merchant token increase">
                              <strong>
                                {execution
                                  .audit
                                  ?.merchantTokenIncrease ??
                                  "—"}{" "}
                                {execution
                                  .audit
                                  ?.tokenSymbol ??
                                  ""}
                              </strong>
                            </Field>
                          </div>

                          <div className="neutral-result">
                            <strong>
                              Live RPC result
                            </strong>

                            <p>
                              <code>
                                {safeJson(
                                  execution
                                    .toolResult
                                    ?.rpcResult
                                )}
                              </code>
                            </p>
                          </div>

                          {execution
                            .payment
                            ?.explorerUrl && (
                              <div className="action-row">
                                <a
                                  className="button ghost"
                                  href={
                                    execution
                                      .payment
                                      .explorerUrl
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Inspect payment
                                </a>
                              </div>
                            )}
                        </>
                      )}

                    {execution.status ===
                      "PAYMENT_BROADCAST_BUT_INCOMPLETE" &&
                      execution.explorerUrl && (
                        <div className="action-row">
                          <a
                            className="button ghost"
                            href={
                              execution
                                .explorerUrl
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Inspect broadcast tx
                          </a>
                        </div>
                      )}
                  </>
                )}
              </section>
            )}
          </div>

          {/*
           * ===================================================
           * SIDEBAR
           * ===================================================
           */}

          <aside className="workspace-side">
            <section className="decision-card">
              <span className="panel-kicker">
                Payment boundary
              </span>

              <div
                className={
                  `decision ${statePresentation.className}`
                }
              >
                {statePresentation.text}
              </div>

              <p>
                {statePresentation.copy}
              </p>

              <div className="boundary-status">
                <div>
                  <span>
                    Payer signing
                  </span>

                  <strong>
                    {payerSigning
                      ? "YES"
                      : "NO"}
                  </strong>
                </div>

                <div>
                  <span>
                    Payment broadcast
                  </span>

                  <strong>
                    {paymentBroadcast
                      ? "YES"
                      : "NO"}
                  </strong>
                </div>
              </div>
            </section>

            {config && (
              <section className="side-card">
                <span className="panel-kicker">
                  Live configuration
                </span>

                <SideField label="Tool">
                  <strong>
                    {config
                      .tool
                      .name}
                  </strong>
                </SideField>

                <SideField label="Protocol">
                  <strong>
                    {config
                      .payment
                      .protocol}
                  </strong>
                </SideField>

                <SideField label="Network">
                  <strong>
                    {config.network}
                  </strong>
                </SideField>

                <SideField label="Payment token">
                  <strong>
                    {config
                      .payment
                      .token}
                  </strong>
                </SideField>

                <SideField label="Price cap">
                  <strong>
                    {config
                      .payment
                      .maximum}{" "}
                    {config
                      .payment
                      .token}
                  </strong>
                </SideField>

                <SideField label="Real execution">
                  <strong>
                    {config
                      .payment
                      .realExecutionEnabled
                      ? "ENABLED"
                      : "DISABLED"}
                  </strong>
                </SideField>
              </section>
            )}

            {proposedPlan && (
              <section className="side-card">
                <span className="panel-kicker">
                  Exact request
                </span>

                <SideField label="Hash">
                  <code>
                    {formatHash(
                      proposedPlan
                        .requestHash
                    )}
                  </code>
                </SideField>

                <SideField label="Tool">
                  <strong>
                    {proposedPlan
                      .request
                      .toolId}
                  </strong>
                </SideField>

                <SideField label="Method">
                  <strong>
                    {proposedPlan
                      .request
                      .method}
                  </strong>
                </SideField>
              </section>
            )}

            {draft && (
              <section className="side-card">
                <span className="panel-kicker">
                  Signed scope
                </span>

                <SideField label="Request">
                  <code>
                    {formatHash(
                      draft
                        .requestHash
                    )}
                  </code>
                </SideField>

                <SideField label="Token">
                  <strong>
                    {draft
                      .payment
                      .token}
                  </strong>
                </SideField>

                <SideField label="Recipient">
                  <code>
                    {formatAddress(
                      draft
                        .payment
                        .recipient
                    )}
                  </code>
                </SideField>

                <SideField label="Maximum">
                  <strong>
                    {draft
                      .payment
                      .amount}{" "}
                    {draft
                      .payment
                      .token}
                  </strong>
                </SideField>

                <SideField label="Expiry">
                  <strong>
                    {formatTimestamp(
                      draft
                        .authorization
                        .validUntil
                    )}
                  </strong>
                </SideField>
              </section>
            )}

            {execution?.request && (
              <section className="side-card">
                <span className="panel-kicker">
                  Request integrity
                </span>

                <ComparisonRow
                  label="Request hash"
                  value={
                    execution
                      .request
                      .matches
                  }
                />

                {execution.paymentTerms && (
                  <>
                    <ComparisonRow
                      label="Chain"
                      value={
                        execution
                          .paymentTerms
                          .sameChain
                      }
                    />

                    <ComparisonRow
                      label="Token"
                      value={
                        execution
                          .paymentTerms
                          .sameToken
                      }
                    />

                    <ComparisonRow
                      label="Recipient"
                      value={
                        execution
                          .paymentTerms
                          .sameRecipient
                      }
                    />

                    <ComparisonRow
                      label="Amount"
                      value={
                        execution
                          .paymentTerms
                          .sameAmount
                      }
                    />

                    <ComparisonRow
                      label="Credential"
                      value={
                        execution
                          .paymentTerms
                          .sameCredentialType
                      }
                    />
                  </>
                )}
              </section>
            )}

            {execution
              ?.verification
              ?.findings &&
              execution
                .verification
                .findings
                .length >
              0 && (
                <section className="side-card findings-card">
                  <span className="panel-kicker">
                    Technical evidence
                  </span>

                  {execution
                    .verification
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

            {execution?.status ===
              "STOPPED" && (
                <section className="side-card">
                  <span className="panel-kicker">
                    No-payment evidence
                  </span>

                  <SideField label="Payer token delta">
                    <strong>
                      {execution
                        .payerTokenDeltaRaw ??
                        "0"}
                    </strong>
                  </SideField>

                  <SideField label="Merchant token delta">
                    <strong>
                      {execution
                        .merchantTokenDeltaRaw ??
                        "0"}
                    </strong>
                  </SideField>

                  <SideField label="Payment tx">
                    <strong>
                      none
                    </strong>
                  </SideField>
                </section>
              )}

            {execution?.status ===
              "COMPLETED" && (
                <section className="side-card">
                  <span className="panel-kicker">
                    Execution evidence
                  </span>

                  <SideField label="Signer invoked">
                    <strong>
                      {boolLabel(
                        execution
                          .audit
                          ?.signerInvoked
                      )}
                    </strong>
                  </SideField>

                  <SideField label="Simulation">
                    <strong>
                      {boolLabel(
                        execution
                          .audit
                          ?.paymentSimulationInvoked
                      )}
                    </strong>
                  </SideField>

                  <SideField label="Broadcast">
                    <strong>
                      {boolLabel(
                        execution
                          .audit
                          ?.paymentBroadcast
                      )}
                    </strong>
                  </SideField>

                  <SideField label="Private key printed">
                    <strong>
                      {boolLabel(
                        execution
                          .audit
                          ?.privateKeyPrinted
                      )}
                    </strong>
                  </SideField>
                </section>
              )}
          </aside>
        </div>
      </main>
    </Shell>
  );
}

/*
 * =======================================================
 * ROUTING
 * =======================================================
 */

export default function App() {
  const normalizedPath =
    window.location.pathname
      .replace(
        /\/+$/,
        ""
      ) ||
    "/";

  if (
    normalizedPath ===
    "/app"
  ) {
    return (
      <HomePage />
    );
  }

  if (
    normalizedPath ===
    "/legacy"
  ) {
    return (
      <WorkspacePage />
    );
  }

  if (
    normalizedPath ===
    "/proof"
  ) {
    return (
      <ProofPage />
    );
  }

  if (
    normalizedPath ===
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