const { ethers } = require("hardhat");

// Contract addresses and configuration
const CONTRACTS = {
  sepolia: {
    multiSourcePaymentReceiver: "0x0E19C68fb128B32524FD3694D3b6dc7e8a3fb8B0",
    crossPayPaymaster: "0x912fea839EB154115CbA1EfF581585d8b1b923ab",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    chainId: 11155111,
    domain: 0
  },
  baseSepolia: {
    multiSourcePaymentReceiver: "0x3CAf30956E604f9Cf7093ccb0474501C624dA874",
    crossPayPaymaster: "0xb6314ed82102BC854aC9c3245ad7D6Cbf56d3Ad3",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    chainId: 84532,
    domain: 6
  },
  arbitrumSepolia: {
    multiSourcePaymentReceiver: "0x72e5FC1fd59cF7cA53FED9931CB19e31a51980E3",
    crossPayPaymaster: "0xCa152591c4398996F883bb731e21eBF800D6b403",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
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

async function logSystemState(network, title) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`${title} - ${network.toUpperCase()}`);
  console.log(`${"=".repeat(50)}`);
  
  const [deployer] = await ethers.getSigners();
  const config = CONTRACTS[network];
  
  // Check deployer balances
  const ethBalance = await ethers.provider.getBalance(deployer.address);
  const usdc = await ethers.getContractAt("IERC20", config.usdc);
  const usdcBalance = await usdc.balanceOf(deployer.address);
  
  console.log("📊 DEPLOYER BALANCES:");
  console.log(`   ETH: ${ethers.formatEther(ethBalance)}`);
  console.log(`   USDC: ${formatUsdc(usdcBalance)}`);
  
  // Check paymaster balance
  const paymasterEthBalance = await ethers.provider.getBalance(config.crossPayPaymaster);
  console.log("💰 PAYMASTER ETH BALANCE:");
  console.log(`   ${ethers.formatEther(paymasterEthBalance)} ETH`);
  
  // Check contract info
  const receiver = await ethers.getContractAt("MultiSourcePaymentReceiver", config.multiSourcePaymentReceiver);
  
  console.log("📈 CONTRACT INFO:");
  console.log(`   Contract Address: ${config.multiSourcePaymentReceiver}`);
  console.log(`   Chain ID: ${config.chainId}, Domain: ${config.domain}`);
  
  return { deployer, config, usdc, receiver };
}

async function createTestOrder() {
  console.log("\n🚀 STEP 1: CREATING ORDER ON BASE SEPOLIA");
  console.log("==========================================");
  
  const { deployer, config, receiver } = await logSystemState("baseSepolia", "BEFORE ORDER CREATION");
  
  // Create unique order ID
  const orderId = ethers.id(`ORDER_${Date.now()}`);
  const merchant = deployer.address;
  const totalAmount = parseUsdc(2); // 2 USDC
  const destinationChainId = config.chainId; // Base Sepolia
  
  console.log("\n📝 ORDER DETAILS:");
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Merchant: ${merchant}`);
  console.log(`   Total Amount: ${formatUsdc(totalAmount)} USDC`);
  console.log(`   Destination Chain: ${destinationChainId} (Base Sepolia)`);
  
  // Create order
  console.log("\n⏳ Creating order transaction...");
  const tx = await receiver.createOrder(orderId, merchant, totalAmount, destinationChainId);
  const receipt = await tx.wait();
  
  console.log("✅ ORDER CREATED!");
  console.log(`   Transaction Hash: ${receipt.hash}`);
  console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
  console.log(`   Block Number: ${receipt.blockNumber}`);
  
  // Check order state
  const order = await receiver.orders(orderId);
  console.log("\n📋 ORDER STATE:");
  console.log(`   Merchant: ${order.merchant}`);
  console.log(`   Total Amount: ${formatUsdc(order.totalAmount)} USDC`);
  console.log(`   Received Amount: ${formatUsdc(order.receivedAmount)} USDC`);
  console.log(`   Is Completed: ${order.isCompleted}`);
  console.log(`   Timestamp: ${order.timestamp}`);
  
  // Check events
  const orderCreatedEvents = receipt.logs.filter(log => {
    try {
      const parsed = receiver.interface.parseLog(log);
      return parsed.name === "OrderCreated";
    } catch {
      return false;
    }
  });
  
  if (orderCreatedEvents.length > 0) {
    console.log("\n📢 EVENTS EMITTED:");
    orderCreatedEvents.forEach((log, index) => {
      const parsed = receiver.interface.parseLog(log);
      console.log(`   Event ${index + 1}: OrderCreated`);
      console.log(`     Order ID: ${parsed.args.orderId}`);
      console.log(`     Merchant: ${parsed.args.merchant}`);
      console.log(`     Amount: ${formatUsdc(parsed.args.totalAmount)} USDC`);
    });
  }
  
  return orderId;
}

async function contributeDirectly(orderId, amount, network) {
  console.log(`\n💰 STEP 2: DIRECT CONTRIBUTION ON ${network.toUpperCase()}`);
  console.log("==========================================");
  
  const { deployer, config, usdc, receiver } = await logSystemState(network, "BEFORE CONTRIBUTION");
  
  const contributionAmount = parseUsdc(amount);
  
  console.log("\n📝 CONTRIBUTION DETAILS:");
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Amount: ${formatUsdc(contributionAmount)} USDC`);
  console.log(`   Network: ${network}`);
  console.log(`   From: ${deployer.address}`);
  
  // Check allowance
  const allowance = await usdc.allowance(deployer.address, config.multiSourcePaymentReceiver);
  console.log(`\n🔍 CURRENT USDC ALLOWANCE: ${formatUsdc(allowance)} USDC`);
  
  if (allowance < contributionAmount) {
    console.log("⏳ Approving USDC spend...");
    const approveTx = await usdc.approve(config.multiSourcePaymentReceiver, contributionAmount);
    await approveTx.wait();
    console.log("✅ USDC approved!");
  }
  
  // Make contribution
  console.log("\n⏳ Making contribution...");
  const beforeBalance = await usdc.balanceOf(deployer.address);
  console.log(`   Before Balance: ${formatUsdc(beforeBalance)} USDC`);
  
  const tx = await receiver.contributeDirectly(orderId, contributionAmount);
  const receipt = await tx.wait();
  
  const afterBalance = await usdc.balanceOf(deployer.address);
  console.log(`   After Balance: ${formatUsdc(afterBalance)} USDC`);
  console.log(`   Spent: ${formatUsdc(beforeBalance - afterBalance)} USDC`);
  
  console.log("\n✅ CONTRIBUTION COMPLETED!");
  console.log(`   Transaction Hash: ${receipt.hash}`);
  console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
  console.log(`   Block Number: ${receipt.blockNumber}`);
  
  // Check order state after contribution
  const order = await receiver.orders(orderId);
  console.log("\n📋 UPDATED ORDER STATE:");
  console.log(`   Total Amount: ${formatUsdc(order.totalAmount)} USDC`);
  console.log(`   Received Amount: ${formatUsdc(order.receivedAmount)} USDC`);
  console.log(`   Remaining: ${formatUsdc(order.totalAmount - order.receivedAmount)} USDC`);
  console.log(`   Is Completed: ${order.isCompleted}`);
  
  // Check events
  const contributionEvents = receipt.logs.filter(log => {
    try {
      const parsed = receiver.interface.parseLog(log);
      return parsed.name === "ContributionReceived";
    } catch {
      return false;
    }
  });
  
  if (contributionEvents.length > 0) {
    console.log("\n📢 EVENTS EMITTED:");
    contributionEvents.forEach((log, index) => {
      const parsed = receiver.interface.parseLog(log);
      console.log(`   Event ${index + 1}: ContributionReceived`);
      console.log(`     Order ID: ${parsed.args.orderId}`);
      console.log(`     Contribution ID: ${parsed.args.contributionId}`);
      console.log(`     Amount: ${formatUsdc(parsed.args.amount)} USDC`);
      console.log(`     Source Chain: ${parsed.args.sourceChainId}`);
      console.log(`     Is Cross Chain: ${parsed.args.isCrossChain}`);
    });
  }
  
  return order.isCompleted;
}

async function main() {
  console.log("🎯 STARTING END-TO-END MULTI-SOURCE PAYMENT TEST");
  console.log("================================================");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Step 1: Create order on Base Sepolia (destination chain)
    const orderId = await createTestOrder();
    
    // Step 2: Make a direct contribution on Base Sepolia (1 USDC)
    const isCompleted = await contributeDirectly(orderId, 1, "baseSepolia");
    
    if (isCompleted) {
      console.log("\n🎉 ORDER COMPLETED WITH SINGLE CONTRIBUTION!");
      console.log("In a real multi-source scenario, we would:");
      console.log("1. Create order for 2 USDC");
      console.log("2. Contribute 1 USDC from Base Sepolia");
      console.log("3. Contribute 1 USDC from Arbitrum Sepolia (cross-chain)");
      console.log("4. Order completes automatically when 2 USDC reached");
    } else {
      console.log("\n📊 ORDER PARTIALLY FUNDED");
      console.log("Ready for additional contributions from other chains!");
    }
    
    // Final system state
    await logSystemState("baseSepolia", "FINAL STATE");
    
    console.log("\n🏁 END-TO-END TEST COMPLETED SUCCESSFULLY!");
    console.log("All contract interactions logged above for debugging.");
    
  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });