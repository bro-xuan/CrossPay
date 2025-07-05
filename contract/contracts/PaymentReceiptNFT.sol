// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract PaymentReceiptNFT is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    using Strings for uint256;

    Counters.Counter private _tokenIdCounter;
    address public splitPaymentReceiver;

    struct Receipt {
        address merchant;
        address payer;
        uint256 amount;
        uint256 merchantAmount;
        uint256 protocolFee;
        uint32 sourceChainId;
        uint32 destinationChainId;
        bytes32 paymentId;
        uint256 timestamp;
        bool isFastTransfer;
    }

    mapping(uint256 => Receipt) public receipts;

    event ReceiptMinted(
        uint256 indexed tokenId,
        address indexed merchant,
        address indexed payer,
        bytes32 paymentId
    );

    error UnauthorizedMinter();
    error InvalidSplitPaymentReceiver();

    modifier onlySplitPaymentReceiver() {
        if (msg.sender != splitPaymentReceiver) revert UnauthorizedMinter();
        _;
    }

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    function setSplitPaymentReceiver(address _splitPaymentReceiver) external onlyOwner {
        if (_splitPaymentReceiver == address(0)) revert InvalidSplitPaymentReceiver();
        splitPaymentReceiver = _splitPaymentReceiver;
    }

    function mintReceipt(
        address merchant,
        address payer,
        uint256 amount,
        uint256 merchantAmount,
        uint256 protocolFee,
        uint32 sourceChainId,
        uint32 destinationChainId,
        bytes32 paymentId,
        bool isFastTransfer
    ) external onlySplitPaymentReceiver returns (uint256) {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();

        receipts[tokenId] = Receipt({
            merchant: merchant,
            payer: payer,
            amount: amount,
            merchantAmount: merchantAmount,
            protocolFee: protocolFee,
            sourceChainId: sourceChainId,
            destinationChainId: destinationChainId,
            paymentId: paymentId,
            timestamp: block.timestamp,
            isFastTransfer: isFastTransfer
        });

        _safeMint(merchant, tokenId);
        _setTokenURI(tokenId, _generateTokenURI(tokenId));

        emit ReceiptMinted(tokenId, merchant, payer, paymentId);

        return tokenId;
    }

    function _generateTokenURI(uint256 tokenId) internal view returns (string memory) {
        Receipt memory receipt = receipts[tokenId];
        
        string memory svg = _generateSVG(receipt);
        
        string memory json = string(abi.encodePacked(
            '{"name": "Payment Receipt #', tokenId.toString(), '",',
            '"description": "Cross-chain USDC payment receipt",',
            '"image": "data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes": [',
                '{"trait_type": "Amount", "value": "', (receipt.amount / 1e6).toString(), ' USDC"},',
                '{"trait_type": "Source Chain", "value": "', Strings.toString(uint256(receipt.sourceChainId)), '"},',
                '{"trait_type": "Destination Chain", "value": "', Strings.toString(uint256(receipt.destinationChainId)), '"},',
                '{"trait_type": "Transfer Type", "value": "', receipt.isFastTransfer ? "Fast" : "Standard", '"},',
                '{"trait_type": "Timestamp", "value": "', receipt.timestamp.toString(), '"}'
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    function _generateSVG(Receipt memory receipt) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">',
            '<rect width="400" height="600" fill="#1a1a1a"/>',
            '<text x="200" y="50" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="bold">Payment Receipt</text>',
            '<text x="20" y="120" fill="#888888" font-size="14">Amount:</text>',
            '<text x="20" y="140" fill="#ffffff" font-size="18">', (receipt.amount / 1e6).toString(), ' USDC</text>',
            '<text x="20" y="180" fill="#888888" font-size="14">Merchant:</text>',
            '<text x="20" y="200" fill="#ffffff" font-size="12">', _addressToString(receipt.merchant), '</text>',
            '<text x="20" y="240" fill="#888888" font-size="14">Chain Transfer:</text>',
            '<text x="20" y="260" fill="#ffffff" font-size="12">', Strings.toString(uint256(receipt.sourceChainId)), ' to ', Strings.toString(uint256(receipt.destinationChainId)), '</text>',
            '<text x="20" y="300" fill="#888888" font-size="14">Type:</text>',
            '<text x="20" y="320" fill="#ffffff" font-size="12">', receipt.isFastTransfer ? "Fast Transfer" : "Standard Transfer", '</text>',
            '<rect x="20" y="360" width="360" height="1" fill="#444444"/>',
            '<text x="200" y="400" text-anchor="middle" fill="#4CAF50" font-size="16">Payment Successful</text>',
            '</svg>'
        ));
    }

    function _addressToString(address addr) internal pure returns (string memory) {
        bytes memory data = abi.encodePacked(addr);
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}