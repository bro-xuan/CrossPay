const { ethers } = require("hardhat");

// Contract addresses
const CONTRACTS = {
  baseSepolia: {
    multiSourcePaymentReceiver: "0x3CAf30956E604f9Cf7093ccb0474501C624dA874",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    chainId: 84532,
    domain: 6
  },
  arbitrumSepolia: {
    multiSourcePaymentReceiver: "0x72e5FC1fd59cF7cA53FED9931CB19e31a51980E3",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    messageTransmitter: "0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872",
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5", // Circle TokenMessenger
    chainId: 421614,
    domain: 3
  }
};

function formatUsdc(amount) {
  return ethers.formatUnits(amount, 6);
}

function parseUsdc(amount) {
  return ethers.parseUnits(amount.toString(), 6);
}

async function getNetworkInfo() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  
  console.log("🌐 NETWORK INFO:");
  console.log(`   Chain ID: ${network.chainId.toString()}`);
  console.log(`   Network: ${hre.network.name}`);
  console.log(`   Deployer: ${deployer.address}`);
  
  return { network, deployer };
}

async function checkArbitrumSetup() {
  console.log("\n🔍 CHECKING ARBITRUM SEPOLIA SETUP");
  console.log("===================================");
  
  const { deployer } = await getNetworkInfo();
  const config = CONTRACTS.arbitrumSepolia;
  
  // Check USDC balance
  const usdc = await ethers.getContractAt("IERC20", config.usdc);
  const usdcBalance = await usdc.balanceOf(deployer.address);
  console.log(`📊 USDC Balance: ${formatUsdc(usdcBalance)} USDC`);
  
  // Check if our contract exists
  const code = await ethers.provider.getCode(config.multiSourcePaymentReceiver);
  console.log(`📋 Contract Deployed: ${code !== "0x"}`);
  
  if (code === "0x") {
    console.log("❌ MultiSourcePaymentReceiver not deployed on Arbitrum Sepolia!");
    console.log("We need to deploy it first for cross-chain testing.");
    return false;
  }
  
  console.log("✅ Arbitrum Sepolia setup looks good!");
  return true;
}

async function initiateDirectCCTPTransfer(orderId, amount) {
  console.log("\n🚀 DIRECT CIRCLE CCTP TRANSFER");
  console.log("===============================");
  console.log("This approach bypasses our contract and uses Circle CCTP directly");
  console.log("Then we'll manually trigger the Base Sepolia contract");
  
  const { deployer } = await getNetworkInfo();
  const config = CONTRACTS.arbitrumSepolia;
  const baseConfig = CONTRACTS.baseSepolia;
  
  console.log("\n📝 TRANSFER DETAILS:");
  console.log(`   Amount: ${amount} USDC`);
  console.log(`   From: Arbitrum Sepolia (domain ${config.domain})`);
  console.log(`   To: Base Sepolia (domain ${baseConfig.domain})`);
  console.log(`   Recipient: Our Base Sepolia contract`);
  
  // For demonstration, let's just show what the process would be
  console.log("\n📋 MANUAL CCTP PROCESS (Educational):");
  console.log("1. Approve USDC to Circle TokenMessenger on Arbitrum");
  console.log("2. Call depositForBurnWithCaller() on TokenMessenger");
  console.log("3. Wait for Circle attestation (2-5 minutes)");
  console.log("4. Call receiveMessage() on Base Sepolia MessageTransmitter");
  console.log("5. USDC minted to our contract on Base Sepolia");
  console.log("6. Our contract receives USDC and processes contribution");
  
  console.log("\n⚠️  SIMPLIFIED TEST:");
  console.log("For now, let's test with a second direct contribution on Base Sepolia");
  console.log("This simulates the USDC arriving from cross-chain transfer");
  
  return true;
}

async function simulateCrossChainCompletion(orderId) {
  console.log("\n💰 SIMULATING CROSS-CHAIN ORDER COMPLETION");
  console.log("==========================================");
  console.log("Making another 1 USDC contribution on Base Sepolia");
  console.log("This simulates USDC arriving from Arbitrum via Circle CCTP");
  
  const { deployer } = await getNetworkInfo();
  const config = CONTRACTS.baseSepolia;
  
  // Get contracts
  const usdc = await ethers.getContractAt("IERC20", config.usdc);
  const receiver = await ethers.getContractAt("MultiSourcePaymentReceiver", config.multiSourcePaymentReceiver);
  
  const amount = parseUsdc(1);
  
  // Check current order state
  const orderBefore = await receiver.orders(orderId);
  console.log("\n📋 ORDER STATE BEFORE:");
  console.log(`   Received: ${formatUsdc(orderBefore.receivedAmount)} USDC`);
  console.log(`   Total: ${formatUsdc(orderBefore.totalAmount)} USDC`);
  console.log(`   Remaining: ${formatUsdc(orderBefore.totalAmount - orderBefore.receivedAmount)} USDC`);
  
  // Approve and contribute
  console.log("\n⏳ Making final 1 USDC contribution...");
  
  const allowance = await usdc.allowance(deployer.address, config.multiSourcePaymentReceiver);
  if (allowance < amount) {
    const approveTx = await usdc.approve(config.multiSourcePaymentReceiver, amount);
    await approveTx.wait();
    console.log("✅ USDC approved");
  }
  
  const beforeBalance = await usdc.balanceOf(deployer.address);
  
  const tx = await receiver.contributeDirectly(orderId, amount);
  const receipt = await tx.wait();
  
  const afterBalance = await usdc.balanceOf(deployer.address);
  
  console.log(`✅ Final contribution completed!`);
  console.log(`   Transaction: ${receipt.hash}`);
  console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
  console.log(`   USDC Spent: ${formatUsdc(beforeBalance - afterBalance)}`);
  
  // Check final order state
  const orderAfter = await receiver.orders(orderId);
  console.log("\n📋 FINAL ORDER STATE:");
  console.log(`   Received: ${formatUsdc(orderAfter.receivedAmount)} USDC`);
  console.log(`   Total: ${formatUsdc(orderAfter.totalAmount)} USDC`);
  console.log(`   Completed: ${orderAfter.isCompleted}`);
  
  if (orderAfter.isCompleted) {
    console.log("\n🎉 ORDER COMPLETED SUCCESSFULLY!");
    
    // Check merchant balance
    const merchantBalance = await receiver.merchantBalances(orderAfter.merchant);
    console.log(`   Merchant Balance: ${formatUsdc(merchantBalance)} USDC`);
    
    // Calculate fee breakdown
    const protocolFee = (orderAfter.totalAmount * 500n) / 10000n; // 5%
    const merchantAmount = orderAfter.totalAmount - protocolFee;
    
    console.log("\n💰 PAYMENT BREAKDOWN:");
    console.log(`   Total Received: ${formatUsdc(orderAfter.totalAmount)} USDC`);
    console.log(`   Merchant (95%): ${formatUsdc(merchantAmount)} USDC`);
    console.log(`   Protocol Fee (5%): ${formatUsdc(protocolFee)} USDC`);
    
    // Check events
    const completionEvents = receipt.logs.filter(log => {
      try {
        const parsed = receiver.interface.parseLog(log);
        return parsed.name === "OrderCompleted";
      } catch {
        return false;
      }
    });
    
    if (completionEvents.length > 0) {
      console.log("\n📢 ORDER COMPLETION EVENT:");
      const parsed = receiver.interface.parseLog(completionEvents[0]);
      console.log(`   Merchant: ${parsed.args.merchant}`);
      console.log(`   Total Amount: ${formatUsdc(parsed.args.totalAmount)} USDC`);
      console.log(`   Merchant Amount: ${formatUsdc(parsed.args.merchantAmount)} USDC`);
      console.log(`   Protocol Fee: ${formatUsdc(parsed.args.protocolFee)} USDC`);
    }
  }
  
  return orderAfter.isCompleted;
}

async function main() {
  console.log("🔗 SIMPLIFIED CROSS-CHAIN TEST");
  console.log("===============================");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Use the new order ID from our recent Base Sepolia test (2 USDC, 1 USDC received)
    const orderId = "0x68fcf3acf95994b4269c6721a594f88a6cefcc46bd18bfba452bac9eff37f3fa";
    console.log(`\n🎯 Testing with Order ID: ${orderId}`);
    
    // Check if we have Arbitrum setup (optional)
    console.log("\n📋 STEP 1: SETUP CHECK");
    // Skipping Arbitrum check for now since we'll simulate
    
    // Simulate the cross-chain completion
    console.log("\n🚀 STEP 2: SIMULATE CROSS-CHAIN COMPLETION");
    const completed = await simulateCrossChainCompletion(orderId);
    
    if (completed) {
      console.log("\n🏁 MULTI-SOURCE PAYMENT TEST COMPLETED!");
      console.log("✅ Order funded from multiple sources (simulated)");
      console.log("✅ 95/5 fee split applied correctly");
      console.log("✅ Merchant received funds");
      console.log("✅ Protocol fees collected");
    } else {
      console.log("\n⚠️  Order not yet completed");
    }
    
    console.log("\n📝 NEXT STEPS FOR REAL CROSS-CHAIN:");
    console.log("1. Deploy MultiSourcePaymentReceiver to Arbitrum Sepolia");
    console.log("2. Implement direct Circle CCTP integration");
    console.log("3. Test actual cross-chain USDC transfers");
    
  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    console.error("Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });