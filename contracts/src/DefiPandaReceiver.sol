// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";

/// @title DefiPandaReceiver - receives DCA workflow reports from Chainlink CRE
/// @notice Extends ReceiverTemplate to process DCA execution reports
contract DefiPandaReceiver is ReceiverTemplate {
    constructor(address forwarderAddress) ReceiverTemplate(forwarderAddress) {}

    /// @inheritdoc ReceiverTemplate
    function _processReport(bytes calldata report) internal pure override {
        // TODO: decode report and execute DCA logic (swap, record position, etc.)
        (report); // silence unused warning
    }
}
