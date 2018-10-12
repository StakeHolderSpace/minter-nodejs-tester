'use strict';
require = require("esm")(module);
const oWalletSdk = require('minterjs-wallet');

process.title = 'Tester';
process.on('uncaughtException', function(err) {
	return false;
});

const oWallet = oWalletSdk.generateWallet();

console.log(oWallet.getMnemonic());