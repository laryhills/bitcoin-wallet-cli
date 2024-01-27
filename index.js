const {
  crypto,
  networks,
  payments,
  initEccLib,
  Psbt,
} = require("bitcoinjs-lib");
const ECPairFactory = require("ecpair").default;
const ecc = require("tiny-secp256k1");
const inquirer = require("inquirer");
const fs = require("fs");
const axios = require("axios");

initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = networks.testnet; // Otherwise, bitcoin = mainnet and regnet = local

const API_URL =
  network === networks.testnet
    ? "https://api.blockchair.com/bitcoin/testnet"
    : "https://api.blockchair.com/bitcoin";

// Set your desired fee rate (in satoshis per byte)
const feeRate = 20;

let walletBalance = null;
let utxos = [];

async function main() {
  try {
    // Check if wallet.json exists
    const walletExists = fs.existsSync("wallet.json");

    if (walletExists) {
      // If wallet exists, ask user for action
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to do?\n",
          choices: [
            "Show Wallet Info",
            "Check Balance",
            "Send Back to Faucet",
            "Create New Wallet\n",
          ],
        },
      ]);

      // Perform the selected action
      switch (action) {
        case "Show Wallet Info":
          showWalletInfo();
          break;
        case "Check Balance":
          await checkBalance();
          break;
        case "Send Back to Faucet":
          await sendToFaucet();
          break;
        case "Create New Wallet":
          await createWallet(true);
          break;
        default:
          throw new Error("Invalid action");
      }
    } else {
      await createWallet(false);
    }
  } catch (error) {
    console.error(error.message);
  }
}

function showWalletInfo() {
  const walletJSON = fs.readFileSync("wallet.json");
  const wallet = JSON.parse(walletJSON);
  console.log(`| Public Address | ${wallet.address} |`);
  console.log(`| Private Key | ${wallet.privateKey} |`);
}

async function createWallet(backup = false) {
  if (backup) {
    const walletData = JSON.parse(fs.readFileSync("wallet.json", "utf-8"));
    const backupFileName = `wallet_backup_${Date.now()}.json`;

    fs.writeFileSync(backupFileName, JSON.stringify(walletData, null, 4));

    console.log(`Wallet backed up to ${backupFileName}`);
  }

  // get wallet type from user
  const { addressType } = await inquirer.prompt([
    {
      type: "list",
      name: "addressType",
      message: "What type of wallet would you like to create?\n",
      choices: ["P2PK", "P2PKH", "P2SH", "P2WPKH", "P2WSH", "P2TR"],
    },
  ]);

  // create wallet
  const keyPair = ECPair.makeRandom();
  let address, privateKey;

  switch (addressType.toUpperCase()) {
    case "P2PK":
      address = payments.p2pk({
        pubkey: keyPair.publicKey,
        network: network,
      }).address;
      break;
    case "P2PKH":
      address = payments.p2pkh({
        pubkey: keyPair.publicKey,
        network: network,
      }).address;
      break;
    case "P2SH":
      address = payments.p2sh({
        redeem: payments.p2wpkh({
          pubkey: keyPair.publicKey,
          network: network,
        }),
        network: network,
      }).address;
      break;
    case "P2WPKH":
      address = payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: network,
      }).address;
      break;
    case "P2WSH":
      address = payments.p2wsh({
        redeem: payments.p2wpkh({
          pubkey: keyPair.publicKey,
          network: network,
        }),
        network: network,
      }).address;
      break;
    case "P2TR":
      const tweakedSigner = tweakSigner(keyPair, { network });
      address = payments.p2tr({
        pubkey: toXOnly(tweakedSigner.publicKey),
        network,
      }).address;
      break;
    default:
      throw new Error("Invalid address type");
  }
  privateKey = keyPair.toWIF();
  console.log("\n");
  console.log(`| Public Address | ${address} |`);
  console.log(`| Private Key | ${privateKey} |`);
  const wallet = {
    address: address,
    privateKey: privateKey,
    addressType: addressType,
  };
  const walletJSON = JSON.stringify(wallet, null, 4);
  fs.writeFileSync("wallet.json", walletJSON);
  console.log(`Wallet created and saved to wallet.json`);
}

async function checkBalance() {
  const walletData = JSON.parse(fs.readFileSync("wallet.json", "utf-8"));
  console.info("\nRequesting Balance...");
  await getAddressInfo(walletData.address);
  if (walletBalance !== null) {
    console.info(
      `Balance of address ${walletData.address}: ${
        walletBalance / 100000000
      } BTC`
    );
  } else {
    console.error("Error checking address balance");
  }
}

async function sendToFaucet() {
  const walletData = JSON.parse(fs.readFileSync("wallet.json", "utf-8"));
  console.info("\nGetting Wallet Info and Balance");
  await getAddressInfo(walletData.address);

  const faucetInputs = await inquirer.prompt([
    {
      type: "input",
      name: "amount",
      message: "Enter the amount to send to the faucet:\n",
      validate: (value) => {
        // Validate as a positive number with up to 8 decimal places
        const isValid = /^\d+(\.\d{1,8})?$/.test(value);
        return isValid || "Please enter a valid amount.";
      },
    },
    {
      type: "input",
      name: "faucetAddress",
      message: "Enter the faucet address:\n",
      validate: (value) => {
        // Validate as a valid bitcoin address
        try {
          const isValid = payments.p2pkh({
            address: value,
            network: network,
          });
          return isValid ? true : "Please enter a valid faucet address.\n";
        } catch (error) {
          return "Error validating address. Please enter a valid faucet address.";
        }
      },
    },
  ]);

  const amount = parseFloat(faucetInputs.amount);
  const faucetAddress = faucetInputs.faucetAddress.trim();

  console.info("\nPreparing transaction...");

  console.info("\nSending back to faucet wallet...");

  // converting privateKey back to WIF
  const privateKey = walletData.privateKey;
  const keyPair = ECPair.fromWIF(privateKey);

  console.info("\nAdding inputs and outputs...");
  const psbt = new Psbt({ network });

  let totalInputValue = 0;
  for (const utxo of utxos) {
    const rawTransaction = await getRawTransaction(utxo.transaction_hash);

    psbt.addInput({
      hash: utxo.transaction_hash,
      index: utxo.index,
      nonWitnessUtxo: rawTransaction,
    });

    totalInputValue += utxo.value;
  }

  console.log("Calculating fee...");
  // Estimate the transaction size in bytes
  let estimatedSize =
    psbt.data.inputs.length * 180 + psbt.data.outputs.length * 34 + 10;

  // Calculate the miner's fee
  let minerFee = estimatedSize * feeRate;
  console.log("Fee:", minerFee, "satoshis");

  // check if balance is sufficient
  if (walletBalance < amount * 100000000 + minerFee) {
    console.error("Insufficient balance");
    return;
  }

  const amountToSpend = amount * 100000000 - minerFee;

  if (amountToSpend === 0) {
    console.error("Amount to spend is 0");
    return;
  }

  if (totalInputValue < amount * 100000000 + minerFee) {
    console.error("Insufficient balance");
    return;
  }

  psbt.addOutput({
    address: faucetAddress,
    value: amountToSpend,
  }); // make amount in satoshis

  // Calculate the remaining balance after sending the amount and paying the fee
  const remainingBalance = totalInputValue - (amountToSpend + minerFee);

  // Add another output that sends the remaining balance back to the original wallet
  if (remainingBalance > 0) {
    psbt.addOutput({
      address: walletData.address,
      value: remainingBalance,
    });
  }

  console.info("\nSigning transaction...");
  for (let i = 0; i < utxos.length; i++) {
    psbt.signInput(i, keyPair); // Sign each input with the private key
  }

  console.info("\nFinalizing transaction...");
  for (let i = 0; i < utxos.length; i++) {
    psbt.finalizeInput(i); // Finalize each input
  }

  // Extract the raw transaction hex
  const txHex = psbt.extractTransaction().toHex();

  console.info("\nTransaction Hex: ", txHex);

  // Broadcast the transaction using Blockstream.info Testnet Explorer API
  const broadcastUrl = `${API_URL}/push/transaction`;
  try {
    const response = await axios.post(broadcastUrl, { data: txHex });
    if (response.data.context.code == 200) {
      console.info(
        "\nTransaction broadcasted. Transaction ID:",
        response.data.data.transaction_hash
      );
    } else {
      console.error(
        "Error broadcasting transaction:",
        response.data.context.error
      );
    }
  } catch (error) {
    console.error(JSON.stringify(error.response.data, null, 4));
    const errorMessage =
      error.response.data?.data?.context?.error ??
      error.response.data?.context?.error ??
      error.response.data?.message ??
      "An Error Occurred";
    console.error("Error broadcasting transaction:", errorMessage);
  }
}

// Add the getAddressUtxo function
async function getAddressInfo(address) {
  const apiUrl = `${API_URL}/dashboards/address/${address}?limit=1`;

  try {
    const response = await axios.get(apiUrl);
    utxos = response.data.data[address].utxo;
    walletBalance = response.data.data[address].address.balance;
    return;
  } catch (error) {
    throw new Error(
      `Error retrieving UTXO for address ${address}: ${error.message}`
    );
  }
}

// Fetch the raw transaction data
async function getRawTransaction(txid) {
  try {
    const response = await axios.get(`${API_URL}/raw/transaction/${txid}`);
    const rawTransaction = response.data.data[txid].raw_transaction;
    return Buffer.from(rawTransaction, "hex");
  } catch (error) {
    throw new Error(
      `Error retrieving raw transaction ${txid}: ${error.message}`
    );
  }
}

function toXOnly(pubkey) {
  return pubkey.subarray(1, 33);
}

function tweakSigner(signer, opts = {}) {
  let privateKey = signer.privateKey ? signer.privateKey : null;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

function tapTweakHash(pubKey, h) {
  return crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

main();
