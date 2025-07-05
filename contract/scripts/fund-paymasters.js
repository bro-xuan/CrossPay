const { ethers } = require("hardhat");

// Updated contract addresses from successful deployments
const PAYMASTERS = {
  sepolia: "0x912fea839EB154115CbA1EfF581585d8b1b923ab",
  baseSepolia: "0xb6314ed82102BC854aC9c3245ad7D6Cbf56d3Ad3", // Updated address
  arbitrumSepolia: "0xCa152591c4398996F883bb731e21eBF800D6b403"
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Funding paymaster on", network);
  console.log("Deployer:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");
  
  const paymasterAddress = PAYMASTERS[network];
  if (!paymasterAddress) {
    console.error("No paymaster configured for network:", network);
    console.log("Available networks:", Object.keys(PAYMASTERS));
    return;
  }
  
  console.log("Paymaster address:", paymasterAddress);
  
  // Check current paymaster balance
  const currentBalance = await ethers.provider.getBalance(paymasterAddress);
  console.log("Current paymaster balance:", ethers.formatEther(currentBalance), "ETH");
  
  // Fund paymaster with ETH for gas sponsorship
  const fundAmount = ethers.parseEther("0.001"); // 0.001 ETH
  
  console.log(`\nSending ${ethers.formatEther(fundAmount)} ETH to paymaster...`);
  
  const tx = await deployer.sendTransaction({
    to: paymasterAddress,
    value: fundAmount
  });
  
  await tx.wait();
  console.log("✅ Transaction confirmed:", tx.hash);
  
  // Check new balance
  const newBalance = await ethers.provider.getBalance(paymasterAddress);
  console.log("New paymaster balance:", ethers.formatEther(newBalance), "ETH");
  
  // Get the paymaster contract to check other details
  try {
    const paymaster = await ethers.getContractAt("CrossPayPaymaster", paymasterAddress);
    
    // Check if we need to stake with EntryPoint
    console.log("\n=== EntryPoint Staking ===");
    const entryPointAddress = await paymaster.entryPoint();
    console.log("EntryPoint address:", entryPointAddress);
    
    // Note: In production, you'd also need to stake with EntryPoint
    // await paymaster.addStake(86400, { value: ethers.parseEther("0.01") });
    console.log("ℹ️  Remember to stake with EntryPoint for production use");
    
  } catch (error) {
    console.log("Could not check EntryPoint details:", error.message);
  }
  
  console.log("\n✅ Paymaster funding complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });