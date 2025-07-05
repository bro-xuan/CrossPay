# CrossPay Frontend Integration Guide

**For Frontend Engineers integrating with CrossPay smart contracts**

## 🎯 Overview

CrossPay is a multi-chain USDC payment system that allows customers to pay from multiple wallets/chains and automatically aggregates payments to merchants. It features:

- **Multi-source payments**: Aggregate USDC from Base, Arbitrum, Ethereum
- **Automatic fee splitting**: 95% to merchant, 5% protocol fee
- **Gas sponsorship**: Users pay in USDC only (no native tokens needed)
- **NFT receipts**: Optional on-chain payment receipts
- **Circle CCTP V2**: Cross-chain USDC transfers

---

## 📋 Contract Addresses (All Testnets)

```javascript
const CROSSPAY_CONTRACTS = {
  // Ethereum Sepolia
  11155111: {
    MultiSourcePaymentReceiver: "0x0E19C68fb128B32524FD3694D3b6dc7e8a3fb8B0",
    CrossPayPaymaster: "0x912fea839EB154115CbA1EfF581585d8b1b923ab",
    PaymentReceiptNFT: "0x3CAf30956E604f9Cf7093ccb0474501C624dA874",
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    domain: 0,
    rpcUrl: "https://sepolia.infura.io/v3/YOUR_KEY"
  },
  
  // Base Sepolia (Primary)
  84532: {
    MultiSourcePaymentReceiver: "0x3CAf30956E604f9Cf7093ccb0474501C624dA874",
    CrossPayPaymaster: "0xb6314ed82102BC854aC9c3245ad7D6Cbf56d3Ad3",
    PaymentReceiptNFT: "0x96dB6Fc76F34Ec465B86241E610C33a302E64fd3",
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    domain: 6,
    rpcUrl: "https://sepolia.base.org"
  },
  
  // Arbitrum Sepolia
  421614: {
    MultiSourcePaymentReceiver: "0x72e5FC1fd59cF7cA53FED9931CB19e31a51980E3",
    CrossPayPaymaster: "0xCa152591c4398996F883bb731e21eBF800D6b403",
    PaymentReceiptNFT: "0x6f1d6a211c01A6df9f73D54a615cDb18Cb8e3004",
    USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    domain: 3,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc"
  }
};

// Helper function to get config for current chain
const getChainConfig = (chainId) => CROSSPAY_CONTRACTS[chainId];
```

---

## 🚀 Quick Start Integration

### 1. **Install Dependencies**

```bash
npm install ethers @privy-io/react-auth @privy-io/wagmi
```

### 2. **Basic Setup**

```javascript
import { ethers } from 'ethers';

// Contract ABI (key functions only)
const MULTISOURCE_ABI = [
  "function createOrder(bytes32 orderId, address merchant, uint256 totalAmount, uint32 destinationChainId)",
  "function contributeDirectly(bytes32 orderId, uint256 amount)",
  "function orders(bytes32) view returns (address merchant, uint256 totalAmount, uint256 receivedAmount, uint256 protocolFeeCharged, bool isCompleted, uint256 timestamp, uint32 destinationChainId)",
  "event OrderCreated(bytes32 indexed orderId, address indexed merchant, uint256 totalAmount, uint32 destinationChainId)",
  "event ContributionReceived(bytes32 indexed orderId, bytes32 indexed contributionId, uint256 amount, uint32 sourceChainId, bool isCrossChain)",
  "event OrderCompleted(bytes32 indexed orderId, address indexed merchant, uint256 totalAmount, uint256 merchantAmount, uint256 protocolFee)"
];

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)"
];
```

### 3. **Connect to Contracts**

```javascript
// Setup provider and contracts for specific chain
const chainId = 84532; // Base Sepolia - or get from user's wallet
const config = getChainConfig(chainId);

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const paymentContract = new ethers.Contract(
  config.MultiSourcePaymentReceiver, 
  MULTISOURCE_ABI, 
  provider
);
const usdcContract = new ethers.Contract(
  config.USDC, 
  USDC_ABI, 
  provider
);
```

---

## 💰 Core Payment Flow

### **Step 1: Create Payment Order (Merchant)**

```javascript
async function createPaymentOrder(merchantAddress, amountInUSDC, signer) {
  // Generate unique order ID
  const orderId = ethers.id(`ORDER_${Date.now()}_${Math.random()}`);
  
  // Convert USDC amount (6 decimals)
  const amount = ethers.parseUnits(amountInUSDC.toString(), 6);
  
  // Create order on destination chain
  const destinationChainId = 84532; // Base Sepolia as destination
  const config = getChainConfig(destinationChainId);
  const contract = new ethers.Contract(config.MultiSourcePaymentReceiver, MULTISOURCE_ABI, signer);
  
  const tx = await contract.createOrder(
    orderId,
    merchantAddress,
    amount,
    destinationChainId
  );
  
  const receipt = await tx.wait();
  console.log('Order created:', orderId);
  
  return { orderId, receipt };
}
```

### **Step 2: Make Payment (Customer)**

```javascript
async function makePayment(orderId, amountInUSDC, customerSigner) {
  const amount = ethers.parseUnits(amountInUSDC.toString(), 6);
  
  // 1. Check USDC balance
  const balance = await usdcContract.balanceOf(customerSigner.address);
  if (balance < amount) {
    throw new Error('Insufficient USDC balance');
  }
  
  // 2. Check/approve USDC allowance
  const allowance = await usdcContract.allowance(
    customerSigner.address, 
    CROSSPAY_CONTRACTS.MultiSourcePaymentReceiver
  );
  
  if (allowance < amount) {
    console.log('Approving USDC...');
    const approveTx = await usdcContract.connect(customerSigner).approve(
      CROSSPAY_CONTRACTS.MultiSourcePaymentReceiver,
      amount
    );
    await approveTx.wait();
  }
  
  // 3. Make payment
  const contract = paymentContract.connect(customerSigner);
  const tx = await contract.contributeDirectly(orderId, amount);
  const receipt = await tx.wait();
  
  console.log('Payment completed:', receipt.hash);
  return receipt;
}
```

### **Step 3: Check Order Status**

```javascript
async function getOrderStatus(orderId) {
  const order = await paymentContract.orders(orderId);
  
  return {
    merchant: order.merchant,
    totalAmount: ethers.formatUnits(order.totalAmount, 6), // Convert to USDC
    receivedAmount: ethers.formatUnits(order.receivedAmount, 6),
    remainingAmount: ethers.formatUnits(order.totalAmount - order.receivedAmount, 6),
    isCompleted: order.isCompleted,
    timestamp: new Date(Number(order.timestamp) * 1000),
    progress: Number((order.receivedAmount * 100n) / order.totalAmount) // Percentage
  };
}
```

---

## 🎧 Event Listening

### **Listen for Payment Events**

```javascript
// Listen for order creation
paymentContract.on('OrderCreated', (orderId, merchant, amount, chainId) => {
  console.log('New order:', {
    orderId,
    merchant,
    amount: ethers.formatUnits(amount, 6) + ' USDC',
    chainId: chainId.toString()
  });
});

// Listen for contributions
paymentContract.on('ContributionReceived', (orderId, contributionId, amount, sourceChain, isCrossChain) => {
  console.log('Payment received:', {
    orderId,
    amount: ethers.formatUnits(amount, 6) + ' USDC',
    sourceChain: sourceChain.toString(),
    isCrossChain
  });
});

// Listen for order completion
paymentContract.on('OrderCompleted', (orderId, merchant, totalAmount, merchantAmount, protocolFee) => {
  console.log('Order completed:', {
    orderId,
    merchant,
    total: ethers.formatUnits(totalAmount, 6) + ' USDC',
    merchantReceived: ethers.formatUnits(merchantAmount, 6) + ' USDC',
    protocolFee: ethers.formatUnits(protocolFee, 6) + ' USDC'
  });
});
```

---

## 🛡️ Privy Integration (Gas Sponsorship)

### **Setup Privy with Smart Accounts**

```javascript
import { PrivyProvider } from '@privy-io/react-auth';

const privyConfig = {
  appId: 'your-privy-app-id',
  config: {
    smartAccount: {
      implementation: 'kernel-v3.1',
      sponsorGas: true
    },
    embeddedWallets: {
      createOnLogin: 'users-without-wallets'
    }
  }
};

function App() {
  return (
    <PrivyProvider {...privyConfig}>
      <CrossPayApp />
    </PrivyProvider>
  );
}
```

### **Using Smart Accounts for Gasless Payments**

```javascript
import { usePrivy, useWallets } from '@privy-io/react-auth';

function PaymentComponent() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  
  const makeGaslessPayment = async (orderId, amount) => {
    if (!authenticated) return;
    
    // Get smart account wallet
    const smartWallet = wallets.find(w => w.walletClientType === 'privy');
    if (!smartWallet) throw new Error('Smart wallet not found');
    
    // Create ethers signer from Privy smart wallet
    const provider = await smartWallet.getEthersProvider();
    const signer = provider.getSigner();
    
    // This payment will be sponsored by our paymaster
    return await makePayment(orderId, amount, signer);
  };
  
  return (
    <button onClick={() => makeGaslessPayment(orderId, 10)}>
      Pay 10 USDC (Gas-Free!)
    </button>
  );
}
```

---

## 💡 Complete Example: Payment Widget

```javascript
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

function CrossPayWidget({ merchantAddress, itemPrice }) {
  const [orderId, setOrderId] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Create order when component mounts
  useEffect(() => {
    createOrder();
  }, []);

  const createOrder = async () => {
    try {
      setIsLoading(true);
      // This would use merchant's signer in real app
      const { orderId } = await createPaymentOrder(merchantAddress, itemPrice, merchantSigner);
      setOrderId(orderId);
    } catch (error) {
      console.error('Failed to create order:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!orderId) return;
    
    try {
      setIsLoading(true);
      // This would use customer's Privy smart wallet
      await makeGaslessPayment(orderId, itemPrice);
      
      // Refresh order status
      const status = await getOrderStatus(orderId);
      setOrderStatus(status);
    } catch (error) {
      console.error('Payment failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="crosspay-widget">
      <h3>Pay {itemPrice} USDC</h3>
      
      {orderId && (
        <div>
          <p>Order ID: {orderId.slice(0, 10)}...</p>
          {orderStatus && (
            <div>
              <p>Progress: {orderStatus.progress}%</p>
              <p>Received: {orderStatus.receivedAmount} USDC</p>
              <p>Remaining: {orderStatus.remainingAmount} USDC</p>
            </div>
          )}
        </div>
      )}
      
      <button 
        onClick={handlePayment}
        disabled={isLoading || !orderId}
      >
        Pay with USDC (Gas-Free)
      </button>
      
      {orderStatus?.isCompleted && (
        <div className="success">
          ✅ Payment Complete! 
          Merchant received {orderStatus.receivedAmount * 0.95} USDC
        </div>
      )}
    </div>
  );
}
```

---

## 🔧 Testing & Development

### **Test with Testnet USDC**

1. **Get testnet USDC**: https://faucet.circle.com/
2. **Base Sepolia RPC**: https://sepolia.base.org
3. **Explorer**: https://sepolia.basescan.org/

### **Test Script Example**

```javascript
// test-integration.js
async function testPaymentFlow() {
  // 1. Create order
  const { orderId } = await createPaymentOrder(merchantAddr, 2, merchantSigner);
  console.log('✅ Order created:', orderId);
  
  // 2. Make payment
  await makePayment(orderId, 1, customer1Signer);
  console.log('✅ First payment made');
  
  // 3. Check status
  let status = await getOrderStatus(orderId);
  console.log('📊 Status:', status);
  
  // 4. Complete payment
  await makePayment(orderId, 1, customer2Signer);
  console.log('✅ Second payment made');
  
  // 5. Final status
  status = await getOrderStatus(orderId);
  console.log('🎉 Final status:', status);
}
```

---

## 📊 Fee Structure

**Important**: CrossPay charges a **5% protocol fee** on all payments.

```javascript
// If customer pays 100 USDC:
// - Merchant receives: 95 USDC
// - Protocol fee: 5 USDC
// - Customer pays: 100 USDC

const calculateFees = (totalAmount) => ({
  customerPays: totalAmount,
  merchantReceives: totalAmount * 0.95,
  protocolFee: totalAmount * 0.05
});
```

---

## 🚨 Error Handling

```javascript
const handleContractError = (error) => {
  if (error.message.includes('insufficient allowance')) {
    return 'Please approve USDC spending first';
  }
  if (error.message.includes('insufficient balance')) {
    return 'Insufficient USDC balance';
  }
  if (error.message.includes('OrderNotFound')) {
    return 'Order not found';
  }
  if (error.message.includes('OrderAlreadyCompleted')) {
    return 'Order already completed';
  }
  return 'Transaction failed. Please try again.';
};
```

---

## 🎯 Next Steps

1. **Start with testnet integration** using the addresses above
2. **Test payment flow** with small amounts (1-2 USDC)
3. **Integrate Privy** for gas sponsorship
4. **Add event listeners** for real-time updates
5. **Deploy to mainnet** when ready (new contract addresses needed)

---

## 📞 Support

- **Contract Code**: `/contracts/MultiSourcePaymentReceiver.sol`
- **Test Scripts**: `/scripts/e2e-test.js`, `/scripts/test-paymaster-nft.js`
- **Privy Guide**: `/docs/PRIVY_INTEGRATION_GUIDE.md`

**Ready to integrate! 🚀**