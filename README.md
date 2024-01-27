# Bitcoin Wallet CLI

This is a command-line interface (CLI) application for managing a Bitcoin wallet. It uses the `bitcoinjs-lib` library to create and manage a Bitcoin wallet. The wallet supports multiple address types including P2PK, P2PKH, P2SH, P2WPKH, P2WSH, and P2TR.

## Features

- Create a new wallet
- Show wallet info
- Check balance
- Send Bitcoin back to a faucet

## Network

By default, this application uses the Bitcoin Testnet. This is a separate network that is used for testing purposes. The Testnet allows developers to experiment without having to use real Bitcoin or worrying about breaking the main Bitcoin chain.

If you want to switch to the Mainnet or another network, you will need to modify the network configuration in the code.

## Installation

To install and run this application, follow these steps:

1. Clone the repository:

```bash
git clone https://github.com/laryhills/bitcoin-wallet-cli.git
```

2. Navigate to the project directory:

```bash
cd bitcoin-wallet-cli
```

3. Install the dependencies:

```bash
npm install
```

4. Run the application:

```bash
node index.js
```

## Usage

When you run the application, you will be prompted with a list of actions to perform:

- Show Wallet Info: Displays the public address and private key of the wallet.
- Check Balance: Checks and displays the balance of the wallet.
- Send Back to Faucet: Sends Bitcoin back to a specified faucet.
- Create New Wallet: Creates a new wallet and saves it to `wallet.json`.

## Dependencies

- `bitcoinjs-lib`: A JavaScript library for Bitcoin cryptography.
- `ecpair`: A library for elliptic curve pairs.
- `tiny-secp256k1`: A small, fast library for elliptic curve cryptography.
- `inquirer`: A library for creating interactive command-line interfaces.
- `fs`: A built-in Node.js module for file system operations.
- `axios`: A promise-based HTTP client for the browser and Node.js.

## Note

This application is for educational purposes only. Do not use it to manage real Bitcoin as it may not be secure.
