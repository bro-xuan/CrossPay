const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MultiSourcePaymentReceiver", function () {
  let MultiSourcePaymentReceiver, multiSourcePaymentReceiver;
  let MockERC20, usdc;
  let owner, protocolFeeRecipient, merchant, messageTransmitter, user1, user2;
  
  const PROTOCOL_FEE_BPS = 500; // 5%
  const MAX_BPS = 10000;
  
  beforeEach(async function () {
    [owner, protocolFeeRecipient, merchant, messageTransmitter, user1, user2] = await ethers.getSigners();
    
    // Deploy mock USDC
    MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USDC", "USDC", 6);
    await usdc.deployed();
    
    // Deploy MultiSourcePaymentReceiver
    MultiSourcePaymentReceiver = await ethers.getContractFactory("MultiSourcePaymentReceiver");
    multiSourcePaymentReceiver = await MultiSourcePaymentReceiver.deploy(
      messageTransmitter.address,
      usdc.address,
      protocolFeeRecipient.address
    );
    await multiSourcePaymentReceiver.deployed();
    
    // Mint USDC to users and contract
    await usdc.mint(user1.address, ethers.utils.parseUnits("1000", 6));
    await usdc.mint(user2.address, ethers.utils.parseUnits("1000", 6));
    await usdc.mint(multiSourcePaymentReceiver.address, ethers.utils.parseUnits("1000", 6));
  });
  
  describe("Order Management", function () {
    const orderId = ethers.utils.id("order_123");
    const totalAmount = ethers.utils.parseUnits("20", 6); // 20 USDC
    const destinationChainId = 8453; // Base
    
    it("Should create order successfully", async function () {
      await expect(
        multiSourcePaymentReceiver.createOrder(
          orderId,
          merchant.address,
          totalAmount,
          destinationChainId
        )
      ).to.emit(multiSourcePaymentReceiver, "OrderCreated")
        .withArgs(orderId, merchant.address, totalAmount, destinationChainId);
      
      const order = await multiSourcePaymentReceiver.getOrder(orderId);
      expect(order.merchant).to.equal(merchant.address);
      expect(order.totalAmount).to.equal(totalAmount);
      expect(order.receivedAmount).to.equal(0);
      expect(order.isCompleted).to.be.false;
    });
    
    it("Should reject order creation with zero amount", async function () {
      await expect(
        multiSourcePaymentReceiver.createOrder(
          orderId,
          merchant.address,
          0,
          destinationChainId
        )
      ).to.be.revertedWith("InvalidAmount");
    });
    
    it("Should reject order creation with zero address merchant", async function () {
      await expect(
        multiSourcePaymentReceiver.createOrder(
          orderId,
          ethers.constants.AddressZero,
          totalAmount,
          destinationChainId
        )
      ).to.be.revertedWith("InvalidMerchantAddress");
    });
  });
  
  describe("Direct Contributions (Same Chain)", function () {
    const orderId = ethers.utils.id("order_123");
    const totalAmount = ethers.utils.parseUnits("20", 6);
    const contributeAmount = ethers.utils.parseUnits("10", 6);
    
    beforeEach(async function () {
      await multiSourcePaymentReceiver.createOrder(
        orderId,
        merchant.address,
        totalAmount,
        8453
      );
    });
    
    it("Should handle direct contribution successfully", async function () {
      // Approve USDC
      await usdc.connect(user1).approve(multiSourcePaymentReceiver.address, contributeAmount);
      
      await expect(
        multiSourcePaymentReceiver.connect(user1).contributeDirectly(orderId, contributeAmount)
      ).to.emit(multiSourcePaymentReceiver, "ContributionReceived");
      
      const order = await multiSourcePaymentReceiver.getOrder(orderId);
      expect(order.receivedAmount).to.equal(contributeAmount);
      expect(order.isCompleted).to.be.false;
    });
    
    it("Should complete order when total amount is reached", async function () {
      // Approve USDC
      await usdc.connect(user1).approve(multiSourcePaymentReceiver.address, totalAmount);
      
      const initialMerchantBalance = await usdc.balanceOf(merchant.address);
      const initialProtocolBalance = await usdc.balanceOf(protocolFeeRecipient.address);
      
      await expect(
        multiSourcePaymentReceiver.connect(user1).contributeDirectly(orderId, totalAmount)
      ).to.emit(multiSourcePaymentReceiver, "OrderCompleted");
      
      const order = await multiSourcePaymentReceiver.getOrder(orderId);
      expect(order.isCompleted).to.be.true;
      
      // Check balances
      const expectedProtocolFee = totalAmount.mul(PROTOCOL_FEE_BPS).div(MAX_BPS);
      const expectedMerchantAmount = totalAmount.sub(expectedProtocolFee);
      
      expect(await usdc.balanceOf(merchant.address)).to.equal(
        initialMerchantBalance.add(expectedMerchantAmount)
      );
      expect(await usdc.balanceOf(protocolFeeRecipient.address)).to.equal(
        initialProtocolBalance.add(expectedProtocolFee)
      );
    });
    
    it("Should reject contribution to non-existent order", async function () {
      const nonExistentOrderId = ethers.utils.id("non_existent");
      
      await expect(
        multiSourcePaymentReceiver.connect(user1).contributeDirectly(nonExistentOrderId, contributeAmount)
      ).to.be.revertedWith("OrderNotFound");
    });
    
    it("Should reject overpayment", async function () {
      const overpayAmount = totalAmount.add(ethers.utils.parseUnits("1", 6));
      
      await usdc.connect(user1).approve(multiSourcePaymentReceiver.address, overpayAmount);
      
      await expect(
        multiSourcePaymentReceiver.connect(user1).contributeDirectly(orderId, overpayAmount)
      ).to.be.revertedWith("OrderOverpayment");
    });
  });
  
  describe("Cross-Chain Contributions", function () {
    const orderId = ethers.utils.id("order_123");
    const totalAmount = ethers.utils.parseUnits("20", 6);
    const contributeAmount = ethers.utils.parseUnits("10", 6);
    const sourceDomain = 1;
    const sourceChainId = 1;
    const sender = ethers.utils.formatBytes32String("sender");
    
    beforeEach(async function () {
      await multiSourcePaymentReceiver.createOrder(
        orderId,
        merchant.address,
        totalAmount,
        8453
      );
    });
    
    function encodeMessageBody(orderId, amount, sourceChainId) {
      return ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "uint256", "uint32"],
        [orderId, amount, sourceChainId]
      );
    }
    
    it("Should handle cross-chain contribution successfully", async function () {
      const messageBody = encodeMessageBody(orderId, contributeAmount, sourceChainId);
      
      await expect(
        multiSourcePaymentReceiver.connect(messageTransmitter).handleReceiveFinalizedMessage(
          sourceDomain,
          sender,
          messageBody
        )
      ).to.emit(multiSourcePaymentReceiver, "ContributionReceived");
      
      const order = await multiSourcePaymentReceiver.getOrder(orderId);
      expect(order.receivedAmount).to.equal(contributeAmount);
      expect(order.isCompleted).to.be.false;
    });
    
    it("Should complete order with cross-chain contribution", async function () {
      const messageBody = encodeMessageBody(orderId, totalAmount, sourceChainId);
      
      await expect(
        multiSourcePaymentReceiver.connect(messageTransmitter).handleReceiveFinalizedMessage(
          sourceDomain,
          sender,
          messageBody
        )
      ).to.emit(multiSourcePaymentReceiver, "OrderCompleted");
      
      const order = await multiSourcePaymentReceiver.getOrder(orderId);
      expect(order.isCompleted).to.be.true;
    });
    
    it("Should reject unauthorized cross-chain messages", async function () {
      const messageBody = encodeMessageBody(orderId, contributeAmount, sourceChainId);
      
      await expect(
        multiSourcePaymentReceiver.connect(user1).handleReceiveFinalizedMessage(
          sourceDomain,
          sender,
          messageBody
        )
      ).to.be.revertedWith("UnauthorizedCaller");
    });
    
    it("Should reject duplicate cross-chain messages", async function () {
      const messageBody = encodeMessageBody(orderId, contributeAmount, sourceChainId);
      
      // First message
      await multiSourcePaymentReceiver.connect(messageTransmitter).handleReceiveFinalizedMessage(
        sourceDomain,
        sender,
        messageBody
      );
      
      // Duplicate message
      await expect(
        multiSourcePaymentReceiver.connect(messageTransmitter).handleReceiveFinalizedMessage(
          sourceDomain,
          sender,
          messageBody
        )
      ).to.be.revertedWith("MessageAlreadyProcessed");
    });
  });
  
  describe("Multi-Source Payment Scenario", function () {
    const orderId = ethers.utils.id("order_123");
    const totalAmount = ethers.utils.parseUnits("20", 6); // 20 USDC total
    const directAmount = ethers.utils.parseUnits("10", 6); // 10 USDC direct
    const crossChainAmount = ethers.utils.parseUnits("10", 6); // 10 USDC cross-chain
    
    beforeEach(async function () {
      await multiSourcePaymentReceiver.createOrder(
        orderId,
        merchant.address,
        totalAmount,
        8453
      );
    });
    
    it("Should handle mixed direct and cross-chain payments", async function () {
      // Direct payment first
      await usdc.connect(user1).approve(multiSourcePaymentReceiver.address, directAmount);
      await multiSourcePaymentReceiver.connect(user1).contributeDirectly(orderId, directAmount);
      
      // Check intermediate state
      let order = await multiSourcePaymentReceiver.getOrder(orderId);
      expect(order.receivedAmount).to.equal(directAmount);
      expect(order.isCompleted).to.be.false;
      
      // Cross-chain payment second
      const messageBody = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "uint256", "uint32"],
        [orderId, crossChainAmount, 1]
      );
      
      const initialMerchantBalance = await usdc.balanceOf(merchant.address);
      const initialProtocolBalance = await usdc.balanceOf(protocolFeeRecipient.address);
      
      await expect(
        multiSourcePaymentReceiver.connect(messageTransmitter).handleReceiveFinalizedMessage(
          1,
          ethers.utils.formatBytes32String("sender"),
          messageBody
        )
      ).to.emit(multiSourcePaymentReceiver, "OrderCompleted");
      
      // Check final state
      order = await multiSourcePaymentReceiver.getOrder(orderId);
      expect(order.receivedAmount).to.equal(totalAmount);
      expect(order.isCompleted).to.be.true;
      
      // Check that protocol fee is calculated on TOTAL amount, not per contribution
      const expectedProtocolFee = totalAmount.mul(PROTOCOL_FEE_BPS).div(MAX_BPS);
      const expectedMerchantAmount = totalAmount.sub(expectedProtocolFee);
      
      expect(await usdc.balanceOf(merchant.address)).to.equal(
        initialMerchantBalance.add(expectedMerchantAmount)
      );
      expect(await usdc.balanceOf(protocolFeeRecipient.address)).to.equal(
        initialProtocolBalance.add(expectedProtocolFee)
      );
    });
    
    it("Should handle order progress tracking", async function () {
      // Initial state
      let progress = await multiSourcePaymentReceiver.getOrderProgress(orderId);
      expect(progress.totalAmount).to.equal(totalAmount);
      expect(progress.receivedAmount).to.equal(0);
      expect(progress.remainingAmount).to.equal(totalAmount);
      expect(progress.isCompleted).to.be.false;
      
      // After partial payment
      await usdc.connect(user1).approve(multiSourcePaymentReceiver.address, directAmount);
      await multiSourcePaymentReceiver.connect(user1).contributeDirectly(orderId, directAmount);
      
      progress = await multiSourcePaymentReceiver.getOrderProgress(orderId);
      expect(progress.receivedAmount).to.equal(directAmount);
      expect(progress.remainingAmount).to.equal(crossChainAmount);
      expect(progress.isCompleted).to.be.false;
      
      // After completion
      const messageBody = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "uint256", "uint32"],
        [orderId, crossChainAmount, 1]
      );
      
      await multiSourcePaymentReceiver.connect(messageTransmitter).handleReceiveFinalizedMessage(
        1,
        ethers.utils.formatBytes32String("sender"),
        messageBody
      );
      
      progress = await multiSourcePaymentReceiver.getOrderProgress(orderId);
      expect(progress.receivedAmount).to.equal(totalAmount);
      expect(progress.remainingAmount).to.equal(0);
      expect(progress.isCompleted).to.be.true;
    });
  });
  
  describe("Fee Calculation", function () {
    it("Should calculate protocol fee correctly on total amount", async function () {
      const orderId = ethers.utils.id("order_123");
      const totalAmount = ethers.utils.parseUnits("100", 6); // 100 USDC
      
      await multiSourcePaymentReceiver.createOrder(
        orderId,
        merchant.address,
        totalAmount,
        8453
      );
      
      // Make payment
      await usdc.connect(user1).approve(multiSourcePaymentReceiver.address, totalAmount);
      await multiSourcePaymentReceiver.connect(user1).contributeDirectly(orderId, totalAmount);
      
      const order = await multiSourcePaymentReceiver.getOrder(orderId);
      const expectedProtocolFee = totalAmount.mul(PROTOCOL_FEE_BPS).div(MAX_BPS);
      
      expect(order.protocolFeeCharged).to.equal(expectedProtocolFee);
      expect(order.protocolFeeCharged).to.equal(ethers.utils.parseUnits("5", 6)); // 5% of 100 = 5 USDC
    });
  });
});