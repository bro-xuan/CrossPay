// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// ERC-4337 interfaces
interface IEntryPoint {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }
    
    function addStake(uint32 unstakeDelaySec) external payable;
    function unlockStake() external;
    function withdrawStake(address payable withdrawAddress) external;
}

interface IPaymaster {
    enum PostOpMode {
        opSucceeded,
        opReverted,
        postOpReverted
    }

    function validatePaymasterUserOp(
        IEntryPoint.UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external;
}

contract CrossPayPaymaster is IPaymaster, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IEntryPoint public immutable entryPoint;
    IERC20 public immutable usdc;
    address public multiSourcePaymentReceiver;
    
    // Gas sponsorship configuration
    uint256 public dailyGasLimit = 1000 * 1e6; // 1000 USDC per day
    uint256 public perUserDailyLimit = 50 * 1e6; // 50 USDC per user per day
    uint256 public minimumPaymentAmount = 10 * 1e6; // Minimum 10 USDC payment to sponsor gas
    
    // Tracking
    mapping(address => uint256) public userDailyGasUsed;
    mapping(address => uint256) public userLastResetDay;
    uint256 public totalDailyGasUsed;
    uint256 public lastGlobalResetDay;
    
    // Pricing oracle for USDC/ETH conversion
    address public priceOracle;
    uint256 public gasPriceMarkup = 110; // 10% markup on gas price
    
    event GasSponsored(address indexed user, uint256 gasCostUSDC, uint256 gasCostNative);
    event GasLimitsUpdated(uint256 dailyLimit, uint256 perUserLimit, uint256 minimumPayment);
    event PriceOracleUpdated(address indexed newOracle);
    
    error ExceedsDailyLimit();
    error ExceedsUserLimit();
    error PaymentTooSmall();
    error InsufficientBalance();
    error InvalidOperation();
    error PriceOracleNotSet();
    error EntryPointOnly();

    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert EntryPointOnly();
        _;
    }

    constructor(
        IEntryPoint _entryPoint,
        IERC20 _usdc,
        address _multiSourcePaymentReceiver
    ) {
        entryPoint = _entryPoint;
        usdc = _usdc;
        multiSourcePaymentReceiver = _multiSourcePaymentReceiver;
        lastGlobalResetDay = block.timestamp / 1 days;
    }

    function validatePaymasterUserOp(
        IEntryPoint.UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override onlyEntryPoint whenNotPaused returns (bytes memory context, uint256 validationData) {
        // Reset daily limits if needed
        _resetDailyLimitsIfNeeded(userOp.sender);
        
        // Validate this is a CrossPay operation
        if (!_isValidCrossPayOperation(userOp)) {
            revert InvalidOperation();
        }
        
        // Calculate gas cost in USDC
        uint256 gasCostUSDC = _convertNativeToUSDC(maxCost);
        
        // Apply markup for price volatility protection
        gasCostUSDC = (gasCostUSDC * gasPriceMarkup) / 100;
        
        // Check if payment amount meets minimum requirement
        uint256 paymentAmount = _extractPaymentAmount(userOp.callData);
        if (paymentAmount < minimumPaymentAmount) {
            revert PaymentTooSmall();
        }
        
        // Check daily limits
        if (totalDailyGasUsed + gasCostUSDC > dailyGasLimit) {
            revert ExceedsDailyLimit();
        }
        
        if (userDailyGasUsed[userOp.sender] + gasCostUSDC > perUserDailyLimit) {
            revert ExceedsUserLimit();
        }
        
        // Check paymaster has enough USDC for gas conversion
        if (usdc.balanceOf(address(this)) < gasCostUSDC) {
            revert InsufficientBalance();
        }
        
        // Update usage tracking
        totalDailyGasUsed += gasCostUSDC;
        userDailyGasUsed[userOp.sender] += gasCostUSDC;
        
        // Return context for postOp
        bytes memory paymasterContext = abi.encode(
            userOp.sender,
            gasCostUSDC,
            paymentAmount,
            block.timestamp
        );
        
        return (paymasterContext, 0); // 0 = valid
    }

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override onlyEntryPoint {
        if (mode == PostOpMode.postOpReverted) {
            return; // Don't do anything if postOp reverted
        }
        
        (address user, uint256 estimatedUSDCCost, uint256 paymentAmount, uint256 timestamp) = 
            abi.decode(context, (address, uint256, uint256, uint256));
        
        // Calculate actual USDC cost
        uint256 actualUSDCCost = _convertNativeToUSDC(actualGasCost);
        actualUSDCCost = (actualUSDCCost * gasPriceMarkup) / 100;
        
        // Adjust tracking for actual vs estimated
        if (actualUSDCCost < estimatedUSDCCost) {
            uint256 refund = estimatedUSDCCost - actualUSDCCost;
            totalDailyGasUsed -= refund;
            userDailyGasUsed[user] -= refund;
        }
        
        emit GasSponsored(user, actualUSDCCost, actualGasCost);
    }

    function _isValidCrossPayOperation(IEntryPoint.UserOperation calldata userOp) 
        private view returns (bool) {
        
        // Check if calling our MultiSourcePaymentReceiver
        if (userOp.callData.length < 4) return false;
        
        bytes4 selector = bytes4(userOp.callData[:4]);
        
        // Extract target address from callData (assuming standard proxy pattern)
        address target = address(bytes20(userOp.callData[16:36]));
        
        if (target != multiSourcePaymentReceiver) return false;
        
        // Check for valid function selectors
        return selector == bytes4(keccak256("createOrder(bytes32,address,uint256,uint32)")) ||
               selector == bytes4(keccak256("contributeDirectly(bytes32,uint256)"));
    }

    function _extractPaymentAmount(bytes calldata callData) private pure returns (uint256) {
        if (callData.length < 68) return 0;
        
        bytes4 selector = bytes4(callData[:4]);
        
        if (selector == bytes4(keccak256("createOrder(bytes32,address,uint256,uint32)"))) {
            // Payment amount is the 3rd parameter (offset 68)
            return abi.decode(callData[68:100], (uint256));
        } else if (selector == bytes4(keccak256("contributeDirectly(bytes32,uint256)"))) {
            // Payment amount is the 2nd parameter (offset 36)
            return abi.decode(callData[36:68], (uint256));
        }
        
        return 0;
    }

    function _convertNativeToUSDC(uint256 nativeAmount) private view returns (uint256) {
        if (priceOracle == address(0)) revert PriceOracleNotSet();
        
        // Simple price oracle call - in production, use Chainlink or similar
        // For now, assume 1 ETH = 3000 USDC (this should be dynamic)
        uint256 ethPriceUSDC = 3000 * 1e6; // $3000 USDC per ETH
        return (nativeAmount * ethPriceUSDC) / 1e18;
    }

    function _resetDailyLimitsIfNeeded(address user) private {
        uint256 currentDay = block.timestamp / 1 days;
        
        // Reset global daily limit
        if (currentDay > lastGlobalResetDay) {
            totalDailyGasUsed = 0;
            lastGlobalResetDay = currentDay;
        }
        
        // Reset user daily limit
        if (currentDay > userLastResetDay[user]) {
            userDailyGasUsed[user] = 0;
            userLastResetDay[user] = currentDay;
        }
    }

    // Admin functions
    function setGasLimits(
        uint256 _dailyGasLimit,
        uint256 _perUserDailyLimit,
        uint256 _minimumPaymentAmount
    ) external onlyOwner {
        dailyGasLimit = _dailyGasLimit;
        perUserDailyLimit = _perUserDailyLimit;
        minimumPaymentAmount = _minimumPaymentAmount;
        
        emit GasLimitsUpdated(_dailyGasLimit, _perUserDailyLimit, _minimumPaymentAmount);
    }

    function setPriceOracle(address _priceOracle) external onlyOwner {
        priceOracle = _priceOracle;
        emit PriceOracleUpdated(_priceOracle);
    }

    function setGasPriceMarkup(uint256 _markup) external onlyOwner {
        require(_markup >= 100 && _markup <= 200, "Markup must be between 100-200%");
        gasPriceMarkup = _markup;
    }

    function withdrawUSDC(address to, uint256 amount) external onlyOwner {
        usdc.safeTransfer(to, amount);
    }

    function depositUSDC(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // View functions
    function getRemainingDailyLimit() external view returns (uint256) {
        return dailyGasLimit > totalDailyGasUsed ? dailyGasLimit - totalDailyGasUsed : 0;
    }

    function getUserRemainingLimit(address user) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > userLastResetDay[user]) {
            return perUserDailyLimit;
        }
        return perUserDailyLimit > userDailyGasUsed[user] ? perUserDailyLimit - userDailyGasUsed[user] : 0;
    }

    function getUSDCBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // Emergency function to add gas to EntryPoint
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    function withdrawStake(address payable withdrawAddress) external onlyOwner {
        entryPoint.withdrawStake(withdrawAddress);
    }

    receive() external payable {
        // Allow receiving ETH for EntryPoint staking
    }
}