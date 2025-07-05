const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Circle CCTP V2 addresses per chain
const CCTP_ADDRESSES = {
  // Testnet addresses
  11155111: { // Sepolia
    messageTransmitterV2: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    domain: 0,
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
  },
  84532: { // Base Sepolia
    messageTransmitterV2: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    domain: 6,
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
  },
  421614: { // Arbitrum Sepolia
    messageTransmitterV2: "0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    domain: 3,
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
  }
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = await deployer.provider.getNetwork().then(network => network.chainId);
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Chain ID:", chainId.toString());
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));
  
  // Get CCTP addresses for current chain
  const cctpConfig = CCTP_ADDRESSES[Number(chainId)];
  if (!cctpConfig) {
    throw new Error(`CCTP addresses not configured for chain ${chainId}`);
  }
  
  console.log("\nCCTP Configuration:");
  console.log("MessageTransmitterV2:", cctpConfig.messageTransmitterV2);
  console.log("USDC:", cctpConfig.usdc);
  console.log("Domain:", cctpConfig.domain);
  
  // Get deployment parameters
  const protocolFeeRecipient = process.env.PROTOCOL_FEE_RECIPIENT || deployer.address;
  
  console.log("\nDeployment Parameters:");
  console.log("Protocol Fee Recipient:", protocolFeeRecipient);
  
  // Deploy MultiSourcePaymentReceiver (regular deployment)
  console.log("\nDeploying MultiSourcePaymentReceiver...");
  const MultiSourcePaymentReceiver = await ethers.getContractFactory("MultiSourcePaymentReceiver");
  const multiSourcePaymentReceiver = await MultiSourcePaymentReceiver.deploy(
    cctpConfig.messageTransmitterV2,
    cctpConfig.usdc,
    protocolFeeRecipient
  );
  await multiSourcePaymentReceiver.waitForDeployment();
  const multiSourcePaymentReceiverAddress = await multiSourcePaymentReceiver.getAddress();
  console.log("MultiSourcePaymentReceiver deployed to:", multiSourcePaymentReceiverAddress);

  // Deploy CrossPayPaymaster
  console.log("\nDeploying CrossPayPaymaster...");
  const CrossPayPaymaster = await ethers.getContractFactory("CrossPayPaymaster");
  const crossPayPaymaster = await CrossPayPaymaster.deploy(
    cctpConfig.entryPoint,
    cctpConfig.usdc,
    multiSourcePaymentReceiverAddress
  );
  await crossPayPaymaster.waitForDeployment();
  console.log("CrossPayPaymaster deployed to:", await crossPayPaymaster.getAddress());
  
  // Deploy PaymentReceiptNFT
  console.log("\nDeploying PaymentReceiptNFT...");
  const PaymentReceiptNFT = await ethers.getContractFactory("PaymentReceiptNFT");
  const paymentReceiptNFT = await PaymentReceiptNFT.deploy("CrossPay Receipt", "CPAY-RCPT");
  await paymentReceiptNFT.waitForDeployment();
  console.log("PaymentReceiptNFT deployed to:", await paymentReceiptNFT.getAddress());
  
  // Set MultiSourcePaymentReceiver address in NFT contract
  console.log("\nSetting MultiSourcePaymentReceiver in NFT contract...");
  const tx = await paymentReceiptNFT.setSplitPaymentReceiver(multiSourcePaymentReceiverAddress);
  await tx.wait();
  console.log("MultiSourcePaymentReceiver set in NFT contract");
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MultiSourcePaymentReceiver: {
        address: multiSourcePaymentReceiverAddress,
        constructorArgs: [cctpConfig.messageTransmitterV2, cctpConfig.usdc, protocolFeeRecipient]
      },
      PaymentReceiptNFT: {
        address: await paymentReceiptNFT.getAddress(),
        constructorArgs: ["CrossPay Receipt", "CPAY-RCPT"]
      },
      CrossPayPaymaster: {
        address: await crossPayPaymaster.getAddress(),
        constructorArgs: [cctpConfig.entryPoint, cctpConfig.usdc, multiSourcePaymentReceiverAddress]
      }
    },
    cctpConfig: cctpConfig
  };
  
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const filename = path.join(deploymentsDir, `${hre.network.name}-${chainId}.json`);
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to ${filename}`);
  
  console.log("\n✅ Deployment complete!");
  console.log("\nContract addresses:");
  console.log("MultiSourcePaymentReceiver:", multiSourcePaymentReceiverAddress);
  console.log("CrossPayPaymaster:", await crossPayPaymaster.getAddress());
  console.log("PaymentReceiptNFT:", await paymentReceiptNFT.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });