// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockV3Aggregator
/// @notice Minimal Chainlink AggregatorV3Interface mock for demo/testing.
///         Allows the owner to update the price, simulating a live Data Feed.
contract MockV3Aggregator {
    uint8 public decimals;
    int256 public latestAnswer;
    uint256 public latestTimestamp;
    uint256 public latestRound;
    address public owner;

    mapping(uint256 => int256) public getAnswer;
    mapping(uint256 => uint256) public getTimestamp;
    mapping(uint256 => uint256) private getStartedAt;

    constructor(uint8 _decimals, int256 _initialAnswer) {
        owner = msg.sender;
        decimals = _decimals;
        _updateAnswer(_initialAnswer);
    }

    function updateAnswer(int256 _answer) external {
        require(msg.sender == owner, "Only owner");
        _updateAnswer(_answer);
    }

    function _updateAnswer(int256 _answer) internal {
        latestAnswer = _answer;
        latestTimestamp = block.timestamp;
        latestRound++;
        getAnswer[latestRound] = _answer;
        getTimestamp[latestRound] = block.timestamp;
        getStartedAt[latestRound] = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (
            uint80(latestRound),
            latestAnswer,
            getStartedAt[latestRound],
            latestTimestamp,
            uint80(latestRound)
        );
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (
            _roundId,
            getAnswer[uint256(_roundId)],
            getStartedAt[uint256(_roundId)],
            getTimestamp[uint256(_roundId)],
            _roundId
        );
    }

    function description() external pure returns (string memory) {
        return "ETH / USD";
    }

    function version() external pure returns (uint256) {
        return 4;
    }
}
