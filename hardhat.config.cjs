const hardhatEthers = require("@nomicfoundation/hardhat-ethers");

const ethersPlugin = hardhatEthers.default || hardhatEthers;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  plugins: [ethersPlugin],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
    },
    mstTestnet: {
      type: "http",
      url: process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com",
      chainId: 91562037,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
