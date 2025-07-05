# Privy + CrossPay Integration Guide

## Overview

This guide shows how to integrate Privy embedded wallets with CrossPay's custom paymaster for a completely gasless USDC payment experience.

## Architecture

```
User Email/Social Login (Privy)
    ↓
Embedded Wallet Creation (Privy)
    ↓
Smart Account with Gas Sponsorship (Privy + Our Paymaster)
    ↓
MultiSourcePaymentReceiver Contract
    ↓
Merchant receives 95% USDC, Protocol gets 5%
```

## Setup Steps

### 1. Privy Dashboard Configuration

1. **Create Privy App**: Go to [Privy Dashboard](https://dashboard.privy.io/)
2. **Configure Smart Accounts**:
   ```javascript
   {
     "smartAccount": {
       "implementation": "kernel-v3.1",
       "sponsorGas": true,
       "paymasterUrl": "https://your-api.com/api/paymaster"
     }
   }
   ```
3. **Set Login Methods**: Email, Google, Apple
4. **Configure Appearance**: Match your brand colors

### 2. Deploy Contracts

```bash
# Deploy to all testnets
npm run deploy:all-testnets

# Note the deployed addresses for:
# - MultiSourcePaymentReceiver (same on all chains)
# - CrossPayPaymaster (per chain)
```

### 3. Set Up Paymaster API

```bash
# Install dependencies
npm install express ethers cors dotenv

# Set environment variables
cp .env.example .env
# Fill in:
# - SEPOLIA_PAYMASTER_ADDRESS=0x...
# - BASE_SEPOLIA_PAYMASTER_ADDRESS=0x...
# - ARBITRUM_SEPOLIA_PAYMASTER_ADDRESS=0x...
# - Each chain's RPC URLs and private keys

# Start paymaster API
node examples/PaymasterAPI.js
```

### 4. Frontend Integration

```bash
# Install Privy SDK
npm install @privy-io/react-auth @privy-io/wagmi-connector

# Update your app with PrivyIntegrationExample.js
```

## Gas Sponsorship Flow

### User Experience:
1. **Login**: User signs in with email/social
2. **Payment**: User enters amount and merchant
3. **Approval**: User signs transaction (no gas visible)
4. **Completion**: Payment processed, merchant receives USDC

### Behind the Scenes:
1. **Privy**: Creates smart account for user
2. **Our Paymaster**: Validates operation and sponsors gas
3. **Smart Account**: Executes transaction using USDC for gas
4. **Contract**: Processes payment and splits funds

## Paymaster Configuration

### Daily Limits (Configurable):
```solidity
uint256 public dailyGasLimit = 1000 * 1e6; // $1000 USDC per day
uint256 public perUserDailyLimit = 50 * 1e6; // $50 USDC per user per day
uint256 public minimumPaymentAmount = 10 * 1e6; // Min $10 USDC payment
```

### Gas Price Protection:
```solidity
uint256 public gasPriceMarkup = 110; // 10% markup for volatility
```

### Sponsored Operations:
- ✅ `createOrder()` - Order creation
- ✅ `contributeDirectly()` - Same-chain payments
- ✅ USDC approvals for payments
- ❌ Other operations (not sponsored)

## Cost Analysis

### Revenue Model:
```
Protocol Fee: 5% of payment amount
Example: $100 payment = $5 revenue
```

### Gas Costs (Your Expense):
```
Ethereum: ~$10-20 per transaction
Base: ~$0.50-2 per transaction  
Arbitrum: ~$1-3 per transaction
Average: ~$4 per transaction
```

### Break-Even Point:
```
Payment Amount > $80 = Profitable
Payment Amount < $80 = Subsidized
```

## Frontend Integration

### Basic Setup:
```javascript
import { PrivyProvider, usePrivy, useSmartAccount } from '@privy-io/react-auth';

const privyConfig = {
  appId: 'your-app-id',
  config: {
    smartAccount: {
      implementation: 'kernel-v3.1',
      sponsorGas: true,
      paymasterUrl: 'https://your-api.com/api/paymaster'
    }
  }
};

function App() {
  return (
    <PrivyProvider {...privyConfig}>
      <PaymentInterface />
    </PrivyProvider>
  );
}
```

### Payment Execution:
```javascript
const { smartAccount } = useSmartAccount();

const executePayment = async () => {
  // Gas automatically sponsored
  const tx = await smartAccount.sendTransaction({
    to: CONTRACT_ADDRESS,
    data: encodeFunctionCall("createOrder", [...args])
  });
};
```

## Testing

### Testnet Testing:
1. **Get Testnet USDC**: Use Circle's testnet faucets
2. **Fund Paymaster**: Deposit USDC to paymaster contract
3. **Test Payments**: Try various payment scenarios
4. **Monitor Costs**: Track gas usage and costs

### Test Scenarios:
- ✅ Single-chain payments (Base → Base)
- ✅ Multi-chain payments (Ethereum + Base → Base)
- ✅ Large payments (>$100)
- ✅ Small payments (<$10)
- ✅ Daily limit testing
- ✅ User limit testing

## Monitoring

### Paymaster Health:
```bash
# Check paymaster status
curl https://your-api.com/api/paymaster/84532/status

# Check user limits
curl https://your-api.com/api/paymaster/84532/user/0x.../limit
```

### Key Metrics:
- Daily gas spending vs limits
- User adoption and retention
- Average payment size
- Cost per transaction
- Revenue vs gas costs

## Security Considerations

### Paymaster Security:
- ✅ Only sponsor CrossPay operations
- ✅ Daily and per-user limits
- ✅ Minimum payment requirements
- ✅ Gas price protection
- ✅ Emergency pause functionality

### User Security:
- ✅ Privy's secure key management
- ✅ Smart account recovery
- ✅ Transaction signing verification
- ✅ No private key exposure

## Troubleshooting

### Common Issues:

**"Operation not eligible for sponsorship"**
- Check if operation is calling CrossPay contracts
- Verify function selector is whitelisted
- Ensure minimum payment amount is met

**"Exceeds daily gas limit"**
- Paymaster has reached daily spending limit
- Wait for daily reset or increase limits
- Check paymaster USDC balance

**"User account not found"**
- User needs to sign in with Privy first
- Smart account creation may be pending
- Check Privy configuration

### Debug Endpoints:
```bash
# Paymaster status
GET /api/paymaster/:chainId/status

# User limits
GET /api/paymaster/:chainId/user/:address/limit

# Health check
GET /health
```

## Production Deployment

### Before Mainnet:
1. **Audit Paymaster Contract**: Security review
2. **Load Testing**: Stress test paymaster API
3. **Gas Price Oracle**: Implement real-time pricing
4. **Monitoring**: Set up alerts and dashboards
5. **Backup Systems**: Redundant paymaster infrastructure

### Mainnet Configuration:
```javascript
const MAINNET_CONFIGS = {
  1: { // Ethereum
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    usdc: "0xA0b86a33E6C6C8e4b96B1a4F2dd8B2E5A1e0f1a9"
  },
  8453: { // Base
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  }
  // Add other mainnet chains
};
```

## Success Metrics

### User Experience:
- ✅ Zero-click payments after login
- ✅ No gas token requirements
- ✅ Email/social login
- ✅ Cross-chain payment optimization

### Business Metrics:
- ✅ User acquisition cost
- ✅ Payment volume growth
- ✅ Gas cost optimization
- ✅ Revenue per user

This integration creates a truly seamless Web3 payment experience where users pay only in USDC and never worry about gas fees or blockchain complexity! 🚀