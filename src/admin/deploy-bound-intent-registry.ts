import {
    createPublicClient,
    createWalletClient,
    http,
    type Abi,
    type Hex,
} from "viem";

import {
    bscTestnet,
} from "viem/chains";

import {
    privateKeyToAccount,
} from "viem/accounts";

import {
    mkdir,
    readFile,
    readdir,
    writeFile,
} from "node:fs/promises";

import path from "node:path";

const EXPECTED_CHAIN_ID = 97;

const RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    ("https:" + "//bsc-testnet-dataseed.bnbchain.org");

const PRIVATE_KEY_PATH =
    process.env.BOUND_AGENT_PRIVATE_KEY_PATH ??
    ".bound/agent/private-key";

const ARTIFACT_DIR =
    "artifacts/contracts";

const DEPLOYMENT_RECORD =
    ".bound/contracts/bound-intent-registry.json";

function parsePrivateKey(
    value: string
): Hex {
    const trimmed =
        value.trim();

    if (
        !/^0x[0-9a-fA-F]{64}$/.test(
            trimmed
        )
    ) {
        throw new Error(
            `Invalid private key format in ${PRIVATE_KEY_PATH}.`
        );
    }

    return trimmed as Hex;
}

async function loadArtifacts(): Promise<{
    abi: Abi;
    bytecode: Hex;
}> {
    const files =
        await readdir(
            ARTIFACT_DIR
        );

    const abiFile =
        files.find(
            (name) =>
                name.endsWith(
                    "BOUNDIntentRegistry.abi"
                )
        );

    const binFile =
        files.find(
            (name) =>
                name.endsWith(
                    "BOUNDIntentRegistry.bin"
                )
        );

    if (
        !abiFile ||
        !binFile
    ) {
        throw new Error(
            "BOUNDIntentRegistry artifacts not found. Compile the contract first."
        );
    }

    const [
        abiText,
        binText,
    ] =
        await Promise.all([
            readFile(
                path.join(
                    ARTIFACT_DIR,
                    abiFile
                ),
                "utf8"
            ),

            readFile(
                path.join(
                    ARTIFACT_DIR,
                    binFile
                ),
                "utf8"
            ),
        ]);

    const cleanBytecode =
        binText.trim();

    if (
        !/^[0-9a-fA-F]+$/.test(
            cleanBytecode
        )
    ) {
        throw new Error(
            "Compiled bytecode is invalid."
        );
    }

    return {
        abi:
            JSON.parse(
                abiText
            ) as Abi,

        bytecode:
            `0x${cleanBytecode}` as Hex,
    };
}

async function main(): Promise<void> {
    if (
        process.env
            .BOUND_DEPLOY_INTENT_REGISTRY !==
        "YES"
    ) {
        throw new Error(
            [
                "Deployment is locked.",
                "",
                "Review the output first.",
                "To intentionally deploy:",
                "",
                "BOUND_DEPLOY_INTENT_REGISTRY=YES npm run contract:deploy:testnet",
            ].join("\n")
        );
    }

    const privateKeyText =
        await readFile(
            PRIVATE_KEY_PATH,
            "utf8"
        );

    // Never print privateKeyText.
    const account =
        privateKeyToAccount(
            parsePrivateKey(
                privateKeyText
            )
        );

    const publicClient =
        createPublicClient({
            chain:
                bscTestnet,

            transport:
                http(
                    RPC_URL
                ),
        });

    const walletClient =
        createWalletClient({
            account,
            chain:
                bscTestnet,

            transport:
                http(
                    RPC_URL
                ),
        });

    const chainId =
        await publicClient
            .getChainId();

    if (
        chainId !==
        EXPECTED_CHAIN_ID
    ) {
        throw new Error(
            `RPC returned chainId=${chainId}; expected ${EXPECTED_CHAIN_ID}.`
        );
    }

    const balance =
        await publicClient
            .getBalance({
                address:
                    account.address,
            });

    if (
        balance === 0n
    ) {
        throw new Error(
            "Deployer has no tBNB for gas."
        );
    }

    const {
        abi,
        bytecode,
    } =
        await loadArtifacts();

    console.log(
        "\nBOUND INTENT REGISTRY DEPLOYMENT\n"
    );

    console.log(
        `Network: ${bscTestnet.name}`
    );

    console.log(
        `Chain ID: ${chainId}`
    );

    console.log(
        `Deployer: ${account.address}`
    );

    console.log(
        "Private key printed: false"
    );

    console.log(
        "Contract holds funds: false"
    );

    console.log(
        "Real MPP payment enabled: false"
    );

    console.log(
        "\nBroadcasting contract deployment..."
    );

    const transactionHash =
        await walletClient
            .deployContract({
                abi,
                bytecode,
                account,
            });

    console.log(
        `Deployment tx: ${transactionHash}`
    );

    console.log(
        "\nWaiting for receipt..."
    );

    const receipt =
        await publicClient
            .waitForTransactionReceipt({
                hash:
                    transactionHash,
            });

    if (
        receipt.status !==
        "success"
    ) {
        throw new Error(
            `Deployment failed: ${transactionHash}`
        );
    }

    if (
        !receipt.contractAddress
    ) {
        throw new Error(
            "Deployment receipt has no contract address."
        );
    }

    const deployedCode =
        await publicClient
            .getCode({
                address:
                    receipt.contractAddress,
            });

    if (
        !deployedCode ||
        deployedCode ===
            "0x"
    ) {
        throw new Error(
            "No runtime bytecode found at deployed address."
        );
    }

    await mkdir(
        path.dirname(
            DEPLOYMENT_RECORD
        ),
        {
            recursive: true,
        }
    );

    const record = {
        contract:
            "BOUNDIntentRegistry",

        network:
            "BNB Smart Chain Testnet",

        chainId,

        address:
            receipt.contractAddress,

        deploymentTransaction:
            transactionHash,

        deployer:
            account.address,

        blockNumber:
            receipt.blockNumber
                .toString(),

        source:
            "contracts/BOUNDIntentRegistry.sol",
    };

    await writeFile(
        DEPLOYMENT_RECORD,
        `${JSON.stringify(
            record,
            null,
            2
        )}\n`,
        "utf8"
    );

    console.log(
        "\nDEPLOYMENT VERIFIED"
    );

    console.log(
        `Contract address: ${receipt.contractAddress}`
    );

    console.log(
        `Block: ${receipt.blockNumber}`
    );

    console.log(
        "Runtime bytecode present: true"
    );

    console.log(
        `Record: ${DEPLOYMENT_RECORD}`
    );
}

main().catch(
    (error: unknown) => {
        console.error(
            error instanceof Error
                ? error.message
                : error
        );

        process.exitCode = 1;
    }
);
