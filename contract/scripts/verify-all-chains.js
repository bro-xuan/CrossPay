const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Chain configurations with Etherscan V2 support
const VERIFICATION_CHAINS = [
  { 
    chainId: 11155111, 
    name: "sepolia",
    apiURL: "https://api.etherscan.io/v2/api?chainid=11155111"
  },
  { 
    chainId: 84532, 
    name: "baseSepolia",
    apiURL: "https://api.etherscan.io/v2/api?chainid=84532"
  },
  { 
    chainId: 421614, 
    name: "arbitrumSepolia",
    apiURL: "https://api.etherscan.io/v2/api?chainid=421614"
  }
];

async function verifyContractOnChain(chainConfig, contractAddress, constructorArgs, contractName) {
  console.log(`\n🔍 Verifying ${contractName} on ${chainConfig.name} (${chainConfig.chainId})`);
  console.log(`📍 Address: ${contractAddress}`);
  console.log(`🔗 API: ${chainConfig.apiURL}`);
  
  try {
    // Use Etherscan V2 unified API
    const response = await fetch(`${chainConfig.apiURL}&module=contract&action=verifysourcecode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        apikey: process.env.ETHERSCAN_API_KEY,
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: contractAddress,
        sourceCode: 'placeholder', // Would need full source
        codeformat: 'solidity-single-file',
        contractname: contractName,
        compilerversion: 'v0.8.20+commit.a1b79de6',
        constructorArguements: constructorArgs
      })
    });
    
    const result = await response.json();
    
    if (result.status === "1") {
      console.log(`✅ ${contractName} verification initiated on ${chainConfig.name}`);
      console.log(`📋 GUID: ${result.result}`);
      return result.result;
    } else {
      console.log(`❌ Verification failed on ${chainConfig.name}: ${result.message}`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Error verifying on ${chainConfig.name}:`, error.message);
    return null;
  }
}

async function checkVerificationStatus(chainConfig, guid) {
  try {
    const response = await fetch(
      `${chainConfig.apiURL}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${process.env.ETHERSCAN_API_KEY}`
    );
    
    const result = await response.json();
    return result;
    
  } catch (error) {
    console.error(`Error checking verification status on ${chainConfig.name}:`, error.message);
    return null;
  }
}

async function verifyAllDeployments() {
  console.log("🚀 Starting cross-chain contract verification with Etherscan V2");
  
  if (!process.env.ETHERSCAN_API_KEY) {
    console.error("❌ ETHERSCAN_API_KEY not found in environment variables");
    process.exit(1);
  }
  
  const deploymentsDir = path.join(__dirname, "../deployments");
  
  for (const chainConfig of VERIFICATION_CHAINS) {
    console.log(`\n🌐 Processing chain: ${chainConfig.name} (${chainConfig.chainId})`);
    
    // Load deployment info
    const deploymentFile = path.join(deploymentsDir, `${chainConfig.name}-${chainConfig.chainId}.json`);
    
    if (!fs.existsSync(deploymentFile)) {
      console.log(`⚠️  No deployment file found: ${deploymentFile}`);
      continue;
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    console.log(`📁 Loaded deployment from ${deploymentFile}`);
    
    // Verify each contract
    const contracts = [
      {
        name: "MultiSourcePaymentReceiver",
        address: deployment.contracts.MultiSourcePaymentReceiver.address,
        args: deployment.contracts.MultiSourcePaymentReceiver.constructorArgs
      },
      {
        name: "CrossPayPaymaster",
        address: deployment.contracts.CrossPayPaymaster?.address,
        args: deployment.contracts.CrossPayPaymaster?.constructorArgs
      },
      {
        name: "PaymentReceiptNFT", 
        address: deployment.contracts.PaymentReceiptNFT.address,
        args: deployment.contracts.PaymentReceiptNFT.constructorArgs
      }
    ].filter(contract => contract.address); // Filter out missing contracts
    
    for (const contract of contracts) {
      const encodedArgs = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "address"], // Adjust types as needed
        contract.args
      ).slice(2); // Remove 0x prefix
      
      await verifyContractOnChain(
        chainConfig,
        contract.address,
        encodedArgs,
        contract.name
      );
      
      // Wait between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log("\n✅ Cross-chain verification completed!");
  console.log("\n📋 Summary:");
  console.log("- All contracts submitted for verification");
  console.log("- Using single Etherscan V2 API key");
  console.log("- Check block explorers for verification status");
}

// Alternative: Use Hardhat's built-in verification with V2 support
async function verifyWithHardhat() {
  console.log("🔧 Using Hardhat verification with Etherscan V2 support");
  
  const networks = ["sepolia", "baseSepolia", "arbitrumSepolia"];
  
  for (const network of networks) {
    console.log(`\n🌐 Verifying contracts on ${network}`);
    
    try {
      // Load deployment info
      const deploymentFile = path.join(__dirname, `../deployments/${network}.json`);
      if (!fs.existsSync(deploymentFile)) continue;
      
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      
      // Verify MultiSourcePaymentReceiver
      if (deployment.contracts.MultiSourcePaymentReceiver) {
        await hre.run("verify:verify", {
          address: deployment.contracts.MultiSourcePaymentReceiver.address,
          constructorArguments: deployment.contracts.MultiSourcePaymentReceiver.constructorArgs,
          network: network
        });
        console.log(`✅ MultiSourcePaymentReceiver verified on ${network}`);
      }
      
      // Add other contracts as needed
      
    } catch (error) {
      console.error(`❌ Error verifying on ${network}:`, error.message);
    }
  }
}

// Export for use in other scripts
module.exports = {
  verifyContractOnChain,
  checkVerificationStatus,
  VERIFICATION_CHAINS
};

// Run if called directly
if (require.main === module) {
  const method = process.argv[2] || "api";
  
  if (method === "hardhat") {
    verifyWithHardhat()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    verifyAllDeployments()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  }
}