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

// CREATE2 Factory address (same on all chains)
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

async function deployWithCreate2(contractName, constructorTypes, constructorArgs, salt) {
  const Contract = await ethers.getContractFactory(contractName);
  const bytecode = Contract.bytecode;
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(constructorTypes, constructorArgs);
  const initCode = bytecode + encodedArgs.slice(2);
  
  // Calculate CREATE2 address
  const initCodeHash = ethers.keccak256(initCode);
  const create2Address = ethers.getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
  
  console.log(`Predicted ${contractName} address:`, create2Address);
  
  // Check if contract already exists at CREATE2 address
  const existingCode = await ethers.provider.getCode(create2Address);
  if (existingCode !== "0x") {
    console.log(`${contractName} already deployed at:`, create2Address);
    return create2Address;
  }
  
  // Deploy using CREATE2
  const [signer] = await ethers.getSigners();
  const factory = new ethers.Contract(CREATE2_FACTORY, [
    "function deploy(bytes memory bytecode, bytes32 salt) public returns (address)"
  ], signer);
  
  const tx = await factory.deploy(initCode, salt);
  const receipt = await tx.wait();
  
  console.log(`${contractName} deployed to:`, create2Address);
  console.log("Transaction hash:", receipt.transactionHash);
  
  return create2Address;
}

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
  const salt = process.env.DEPLOYMENT_SALT || ethers.id("CrossPayV1");
  
  console.log("\nDeployment Parameters:");
  console.log("Protocol Fee Recipient:", protocolFeeRecipient);
  console.log("Salt:", salt);
  
  // Deploy MultiSourcePaymentReceiver with CREATE2
  console.log("\nDeploying MultiSourcePaymentReceiver...");
  const multiSourcePaymentReceiverAddress = await deployWithCreate2(
    "MultiSourcePaymentReceiver",
    ["address", "address", "address"],
    [cctpConfig.messageTransmitterV2, cctpConfig.usdc, protocolFeeRecipient],
    salt
  );

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
  
  // Deploy PaymentReceiptNFT (optional, not using CREATE2 for NFT)
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
    cctpConfig: cctpConfig,
    salt: salt
  };
  
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const filename = path.join(deploymentsDir, `${hre.network.name}-${chainId}.json`);
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to ${filename}`);
  
  // Verify contracts on Etherscan V2 (if not on localhost)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations before verification...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    
    console.log(`\nVerifying contracts on Etherscan V2 for chain ${chainId}...`);
    
    // Verify MultiSourcePaymentReceiver
    try {
      await hre.run("verify:verify", {
        address: multiSourcePaymentReceiverAddress,
        constructorArguments: [cctpConfig.messageTransmitterV2, cctpConfig.usdc, protocolFeeRecipient],
        network: hre.network.name
      });
      console.log("✅ MultiSourcePaymentReceiver verified");
    } catch (error) {
      console.error("❌ Error verifying MultiSourcePaymentReceiver:", error.message);
    }
    
    // Verify CrossPayPaymaster
    try {
      await hre.run("verify:verify", {
        address: await crossPayPaymaster.getAddress(),
        constructorArguments: [cctpConfig.entryPoint, cctpConfig.usdc, multiSourcePaymentReceiverAddress],
        network: hre.network.name
      });
      console.log("✅ CrossPayPaymaster verified");
    } catch (error) {
      console.error("❌ Error verifying CrossPayPaymaster:", error.message);
    }
    
    // Verify PaymentReceiptNFT
    try {
      await hre.run("verify:verify", {
        address: await paymentReceiptNFT.getAddress(),
        constructorArguments: ["CrossPay Receipt", "CPAY-RCPT"],
        network: hre.network.name
      });
      console.log("✅ PaymentReceiptNFT verified");
    } catch (error) {
      console.error("❌ Error verifying PaymentReceiptNFT:", error.message);
    }
  }
  
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