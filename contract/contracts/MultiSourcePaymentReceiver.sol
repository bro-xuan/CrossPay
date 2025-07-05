// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IMessageHandlerV2.sol";

contract MultiSourcePaymentReceiver is IMessageHandlerV2, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PROTOCOL_FEE_BPS = 500; // 5%
    uint256 public constant MAX_BPS = 10000;

    address public immutable messageTransmitterV2;
    IERC20 public immutable usdc;
    address public protocolFeeRecipient;

    struct PaymentOrder {
        address merchant;
        uint256 totalAmount;
        uint256 receivedAmount;
        uint256 protocolFeeCharged;
        bool isCompleted;
        uint256 timestamp;
        uint32 destinationChainId;
    }

    struct PaymentContribution {
        bytes32 orderId;
        uint256 amount;
        uint32 sourceChainId;
        bool isCrossChain;
        uint256 timestamp;
    }

    mapping(bytes32 => PaymentOrder) public orders;
    mapping(bytes32 => bool) public processedMessages;
    mapping(bytes32 => PaymentContribution) public contributions;
    mapping(address => uint256) public merchantBalances;
    
    uint256 public totalOrdersProcessed;
    uint256 public totalVolumeProcessed;

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed merchant,
        uint256 totalAmount,
        uint32 destinationChainId
    );

    event ContributionReceived(
        bytes32 indexed orderId,
        bytes32 indexed contributionId,
        uint256 amount,
        uint32 sourceChainId,
        bool isCrossChain
    );

    event OrderCompleted(
        bytes32 indexed orderId,
        address indexed merchant,
        uint256 totalAmount,
        uint256 merchantAmount,
        uint256 protocolFee
    );

    event ProtocolFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    error InvalidMessageTransmitter();
    error InvalidUSDCAddress();
    error InvalidProtocolFeeRecipient();
    error MessageAlreadyProcessed();
    error InvalidMerchantAddress();
    error InvalidAmount();
    error OrderNotFound();
    error OrderAlreadyCompleted();
    error OrderOverpayment();
    error InsufficientAllowance();
    error InsufficientBalance();
    error UnauthorizedCaller();

    modifier onlyMessageTransmitter() {
        if (msg.sender != messageTransmitterV2) revert UnauthorizedCaller();
        _;
    }

    constructor(
        address _messageTransmitterV2,
        address _usdc,
        address _protocolFeeRecipient
    ) {
        if (_messageTransmitterV2 == address(0)) revert InvalidMessageTransmitter();
        if (_usdc == address(0)) revert InvalidUSDCAddress();
        if (_protocolFeeRecipient == address(0)) revert InvalidProtocolFeeRecipient();

        messageTransmitterV2 = _messageTransmitterV2;
        usdc = IERC20(_usdc);
        protocolFeeRecipient = _protocolFeeRecipient;
    }

    // Create a new payment order
    function createOrder(
        bytes32 orderId,
        address merchant,
        uint256 totalAmount,
        uint32 destinationChainId
    ) external whenNotPaused {
        if (merchant == address(0)) revert InvalidMerchantAddress();
        if (totalAmount == 0) revert InvalidAmount();
        if (orders[orderId].merchant != address(0)) revert("Order already exists");

        orders[orderId] = PaymentOrder({
            merchant: merchant,
            totalAmount: totalAmount,
            receivedAmount: 0,
            protocolFeeCharged: 0,
            isCompleted: false,
            timestamp: block.timestamp,
            destinationChainId: destinationChainId
        });

        emit OrderCreated(orderId, merchant, totalAmount, destinationChainId);
    }

    // Handle direct USDC transfers (same chain)
    function contributeDirectly(
        bytes32 orderId,
        uint256 amount
    ) external whenNotPaused nonReentrant {
        PaymentOrder storage order = orders[orderId];
        if (order.merchant == address(0)) revert OrderNotFound();
        if (order.isCompleted) revert OrderAlreadyCompleted();
        if (order.receivedAmount + amount > order.totalAmount) revert OrderOverpayment();

        // Transfer USDC from sender to this contract
        if (usdc.balanceOf(msg.sender) < amount) revert InsufficientBalance();
        if (usdc.allowance(msg.sender, address(this)) < amount) revert InsufficientAllowance();
        
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        bytes32 contributionId = keccak256(abi.encode(orderId, msg.sender, amount, block.timestamp));
        
        contributions[contributionId] = PaymentContribution({
            orderId: orderId,
            amount: amount,
            sourceChainId: uint32(block.chainid),
            isCrossChain: false,
            timestamp: block.timestamp
        });

        order.receivedAmount += amount;

        emit ContributionReceived(orderId, contributionId, amount, uint32(block.chainid), false);

        _checkAndCompleteOrder(orderId);
    }

    // Handle cross-chain CCTP transfers (finalized)
    function handleReceiveFinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        bytes calldata messageBody
    ) external override onlyMessageTransmitter whenNotPaused nonReentrant returns (bool success) {
        return _handleCrossChainContribution(sourceDomain, sender, messageBody, true);
    }

    // Handle cross-chain CCTP transfers (unfinalized)
    function handleReceiveUnfinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        bytes calldata messageBody,
        uint256 finalityThresholdExecuted
    ) external override onlyMessageTransmitter whenNotPaused nonReentrant returns (bool success) {
        return _handleCrossChainContribution(sourceDomain, sender, messageBody, false);
    }

    function _handleCrossChainContribution(
        uint32 sourceDomain,
        bytes32 sender,
        bytes calldata messageBody,
        bool isFinalized
    ) private returns (bool) {
        // Prevent duplicate processing
        bytes32 messageHash = keccak256(abi.encode(sourceDomain, sender, messageBody));
        if (processedMessages[messageHash]) revert MessageAlreadyProcessed();
        processedMessages[messageHash] = true;

        // Decode message body
        (bytes32 orderId, uint256 amount, uint32 sourceChainId) = _decodeMessageBody(messageBody);

        PaymentOrder storage order = orders[orderId];
        if (order.merchant == address(0)) revert OrderNotFound();
        if (order.isCompleted) revert OrderAlreadyCompleted();
        if (order.receivedAmount + amount > order.totalAmount) revert OrderOverpayment();

        bytes32 contributionId = keccak256(abi.encode(orderId, sourceDomain, sender, amount, block.timestamp));
        
        contributions[contributionId] = PaymentContribution({
            orderId: orderId,
            amount: amount,
            sourceChainId: sourceChainId,
            isCrossChain: true,
            timestamp: block.timestamp
        });

        order.receivedAmount += amount;

        emit ContributionReceived(orderId, contributionId, amount, sourceChainId, true);

        _checkAndCompleteOrder(orderId);

        return true;
    }

    function _checkAndCompleteOrder(bytes32 orderId) private {
        PaymentOrder storage order = orders[orderId];
        
        if (order.receivedAmount >= order.totalAmount && !order.isCompleted) {
            order.isCompleted = true;
            
            // Calculate protocol fee on the TOTAL amount (not per contribution)
            uint256 protocolFee = (order.totalAmount * PROTOCOL_FEE_BPS) / MAX_BPS;
            uint256 merchantAmount = order.totalAmount - protocolFee;
            
            order.protocolFeeCharged = protocolFee;
            merchantBalances[order.merchant] += merchantAmount;
            totalOrdersProcessed++;
            totalVolumeProcessed += order.totalAmount;

            // Transfer funds
            usdc.safeTransfer(order.merchant, merchantAmount);
            usdc.safeTransfer(protocolFeeRecipient, protocolFee);

            emit OrderCompleted(orderId, order.merchant, order.totalAmount, merchantAmount, protocolFee);
        }
    }

    function _decodeMessageBody(bytes calldata messageBody) private pure returns (
        bytes32 orderId,
        uint256 amount,
        uint32 sourceChainId
    ) {
        require(messageBody.length >= 96, "Invalid message length");
        
        assembly {
            orderId := calldataload(add(messageBody.offset, 0))
            amount := calldataload(add(messageBody.offset, 32))
            sourceChainId := calldataload(add(messageBody.offset, 64))
        }
    }

    // Admin functions
    function updateProtocolFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidProtocolFeeRecipient();
        
        address oldRecipient = protocolFeeRecipient;
        protocolFeeRecipient = newRecipient;
        
        emit ProtocolFeeRecipientUpdated(oldRecipient, newRecipient);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw(address token, address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert InvalidProtocolFeeRecipient();
        
        if (token == address(0)) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    // View functions
    function getOrder(bytes32 orderId) external view returns (PaymentOrder memory) {
        return orders[orderId];
    }

    function getContribution(bytes32 contributionId) external view returns (PaymentContribution memory) {
        return contributions[contributionId];
    }

    function getOrderProgress(bytes32 orderId) external view returns (
        uint256 totalAmount,
        uint256 receivedAmount,
        uint256 remainingAmount,
        bool isCompleted
    ) {
        PaymentOrder memory order = orders[orderId];
        return (
            order.totalAmount,
            order.receivedAmount,
            order.totalAmount - order.receivedAmount,
            order.isCompleted
        );
    }

    receive() external payable {}
}