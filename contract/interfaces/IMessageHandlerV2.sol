// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMessageHandlerV2 {
    /**
     * @notice Handles an incoming message that has reached finality threshold
     * @param sourceDomain The domain ID of the source chain
     * @param sender The sender address on the source chain
     * @param messageBody The message body containing custom data
     * @return success Whether the message was handled successfully
     */
    function handleReceiveFinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        bytes calldata messageBody
    ) external returns (bool success);

    /**
     * @notice Handles an incoming message that has not reached finality threshold
     * @param sourceDomain The domain ID of the source chain
     * @param sender The sender address on the source chain
     * @param messageBody The message body containing custom data
     * @param finalityThresholdExecuted The finality threshold value
     * @return success Whether the message was handled successfully
     */
    function handleReceiveUnfinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        bytes calldata messageBody,
        uint256 finalityThresholdExecuted
    ) external returns (bool success);
}