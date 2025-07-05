# CrossPay Smart Contracts

**Multi-chain USDC payment aggregation system using Circle CCTP V2 hooks**

## 🎯 Overview

CrossPay enables merchants to accept USDC payments from multiple wallets across different chains, with automatic aggregation and fee splitting. Built for gasless user experience with Privy integration.

### Key Features

- **Multi-source payments**: Aggregate USDC from Base, Arbitrum, Ethereum
- **Automatic fee splitting**: 95% to merchant, 5% protocol fee  
- **Gas sponsorship**: Users pay in USDC only (ERC-4337 paymaster)
- **Cross-chain support**: Circle CCTP V2 for seamless transfers
- **NFT receipts**: Optional on-chain payment verification
- **Privy integration**: Embedded wallets with social login

## 🚀 Quick Start

### For Frontend Engineers
📖 **[Frontend Integration Guide](./docs/FRONTEND_INTEGRATION.md)** - Complete guide with code examples

### For Smart Contract Developers

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Deploy to testnet
npm run deploy:base-sepolia
```

## 📋 Deployed Contracts (Base Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| MultiSourcePaymentReceiver | `0x3CAf30956E604f9Cf7093ccb0474501C624dA874` | Main payment aggregation |
| CrossPayPaymaster | `0xb6314ed82102BC854aC9c3245ad7D6Cbf56d3Ad3` | Gas sponsorship (ERC-4337) |
| PaymentReceiptNFT | `0x96dB6Fc76F34Ec465B86241E610C33a302E64fd3` | NFT receipts |
| USDC (Testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Circle testnet USDC |

## 💡 How It Works

1. **Merchant creates order** for X USDC on destination chain
2. **Customers contribute** from multiple wallets/chains 
3. **Circle CCTP** handles cross-chain USDC transfers
4. **Order completes** automatically when target reached
5. **Automatic fee split**: 95% merchant, 5% protocol

```javascript
// Example: 2 USDC order
createOrder(orderId, merchant, parseUSDC(2), BASE_SEPOLIA);

// Customer 1: 1 USDC from Base
contributeDirectly(orderId, parseUSDC(1));

// Customer 2: 1 USDC from Arbitrum (cross-chain via CCTP)
contributeDirectly(orderId, parseUSDC(1)); 

// Result: Merchant gets 1.9 USDC, Protocol gets 0.1 USDC
```

## 🛠️ Development

### Project Structure

```
contracts/
├── MultiSourcePaymentReceiver.sol   # Main payment contract
├── CrossPayPaymaster.sol           # Gas sponsorship  
├── PaymentReceiptNFT.sol           # NFT receipts
└── mocks/                          # Test contracts

scripts/
├── deploy.js                       # Deployment script
├── fund-paymasters.js             # Paymaster funding
├── e2e-test.js                    # End-to-end testing
└── simple-cross-chain-test.js     # Cross-chain simulation

docs/
├── FRONTEND_INTEGRATION.md        # 👈 START HERE for frontend
├── PRIVY_INTEGRATION_GUIDE.md     # Privy setup guide
└── INTEGRATION_GUIDE.md           # Technical details
```

### Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Fill in your values:
PRIVATE_KEY=your_deployer_private_key
BASE_SEPOLIA_RPC_URL=your_base_sepolia_rpc
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Testing

```bash
# Run all tests
npm test

# Test specific contract
npm run test:multi

# End-to-end test (requires testnet deployment)
npx hardhat run scripts/e2e-test.js --network baseSepolia

# Test paymaster & NFT functionality  
npx hardhat run scripts/test-paymaster-nft.js --network baseSepolia
```

### Deployment

```bash
# Deploy to single network
npm run deploy:base-sepolia

# Deploy to all testnets
npm run deploy:all-testnets

# Fund paymasters for gas sponsorship
npx hardhat run scripts/fund-paymasters.js --network baseSepolia
```

## 🔧 Integration Examples

### Basic Payment Flow

```javascript
import { ethers } from 'ethers';

// 1. Create order (merchant)
const orderId = ethers.id(`ORDER_${Date.now()}`);
await paymentContract.createOrder(orderId, merchantAddr, amount, chainId);

// 2. Make payment (customer) 
await usdcContract.approve(paymentContract.address, amount);
await paymentContract.contributeDirectly(orderId, amount);

// 3. Check status
const order = await paymentContract.orders(orderId);
console.log('Order completed:', order.isCompleted);
```

### With Privy (Gasless)

```javascript
import { usePrivy, useWallets } from '@privy-io/react-auth';

// Use smart account for gasless payments
const { wallets } = useWallets();
const smartWallet = wallets.find(w => w.walletClientType === 'privy');
const signer = await smartWallet.getEthersProvider().getSigner();

// Payment sponsored by paymaster
await paymentContract.connect(signer).contributeDirectly(orderId, amount);
```

## 📊 Fee Structure

CrossPay charges a **5% protocol fee** on all transactions:

| Amount | Merchant Receives | Protocol Fee | Customer Pays |
|--------|------------------|--------------|---------------|
| 100 USDC | 95 USDC | 5 USDC | 100 USDC |
| 10 USDC | 9.5 USDC | 0.5 USDC | 10 USDC |
| 2 USDC | 1.9 USDC | 0.1 USDC | 2 USDC |

## 🌐 Supported Networks

### Testnet (Current)
- ✅ **Base Sepolia** (primary)
- ✅ **Ethereum Sepolia** 
- ✅ **Arbitrum Sepolia**

### Mainnet (Future)
- 🔄 **Base** (planned)
- 🔄 **Ethereum** (planned)
- 🔄 **Arbitrum** (planned)

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Customer A    │    │   Customer B     │    │   Customer C    │
│  (Base Chain)   │    │ (Arbitrum Chain) │    │ (Ethereum Chain)│
└─────────┬───────┘    └─────────┬────────┘    └─────────┬───────┘
          │                      │                       │
          │ contributeDirectly() │ Circle CCTP           │ Circle CCTP
          │                      │                       │
          ▼                      ▼                       ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │           MultiSourcePaymentReceiver (Base Chain)               │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
    │  │   Orders    │  │ Aggregation │  │     Fee Splitting       │  │
    │  │ Management  │  │   Logic     │  │   (95% / 5%)           │  │
    │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
            ┌──────────────┐ ┌──────────┐ ┌─────────────┐
            │   Merchant   │ │ Protocol │ │ NFT Receipt │
            │   (95%)      │ │   (5%)   │ │ (Optional)  │
            └──────────────┘ └──────────┘ └─────────────┘
```

## 🛡️ Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Pausable**: Emergency pause functionality  
- **Ownable**: Admin controls for critical functions
- **SafeERC20**: Secure token transfers
- **Access Controls**: Role-based permissions

## 📚 Documentation

- **[Frontend Integration](./docs/FRONTEND_INTEGRATION.md)** - Complete frontend guide
- **[Privy Integration](./docs/PRIVY_INTEGRATION_GUIDE.md)** - Gas sponsorship setup
- **[Technical Guide](./docs/INTEGRATION_GUIDE.md)** - Detailed implementation
- **[Etherscan V2 Guide](./docs/ETHERSCAN_V2_GUIDE.md)** - Contract verification

## 🏆 Hackathon Focus

Built for **ETHGlobal Cannes Hackathon** targeting:
- 🥇 **Privy: Best Consumer App** - Seamless UX with embedded wallets
- 🥇 **Privy: Best Use of Stablecoins** - USDC-native payment experience
- 🥇 **Circle: Build a Multichain USDC Payment System**

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready to integrate CrossPay into your application! 🚀**

For frontend integration, start with: **[Frontend Integration Guide](./docs/FRONTEND_INTEGRATION.md)**