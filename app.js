// for debuging add to console command before run app.js : set NODE_ENV=development
//"http://35.205.94.100:8841"
'use strict';
const axios = require('axios');

require = require('esm')(module);

const
		minimist    = require('minimist'),
		args        = minimist(process.argv.slice(2), {
			boolean: [
				'fund', 'wdwl', 'send', 'delegate'
			],
			alias  : {
				f: 'fund',
				w: 'wdwl',
				s: 'send',
				d: 'delegate'
			},
			default: {
				fund    : false,
				wdwl    : false,
				send    : false,
				delegate: false
			}
		}),
		oPath       = require('path'),
		sLibRoot    = oPath.join(__dirname, './lib/'),
		sUtilsRoot  = oPath.join(sLibRoot, '/utils/'),
		sTestsRoot  = oPath.join(sLibRoot, '/tests/'),
		Promise     = require('bluebird'),
		CliProgress = require('cli-progress'),
		oConfig     = require(sUtilsRoot + 'nconf'),
		oUtils      = require(sUtilsRoot + 'utils'),
		oLogger     = require(sUtilsRoot + 'winston')(module);

process.env.NODE_ENV = (oConfig.get('verbose')) ? 'development' : '';
process.title = 'StakeHolder Overload Tests';
process.on('uncaughtException', function(err) {
	oLogger.error('Caught exception: ' + err);
	console.log(err.stack.split('\n'));
	return false;
});

const oMinterHelper = require(sUtilsRoot + '/minter-helper');

// ==============================================================================

oMinterHelper.init().then(async () => {

	const
			fSendFee           = 0.02,
			fDelegateFee       = 0.1,
			fTxAmount          = 0.1,
			iTotalTestDuration = parseInt(oConfig.get('totalTestDuration')) || 60,// seconds
			iTotalTxPerWallet  = Math.round(iTotalTestDuration / 5),
			iTotalWalletsCount = parseInt(oConfig.get('totalWallets')) || 10;// workers

	// prepare Wallets
	let arWalletInstances = await oMinterHelper.loadWallets(iTotalWalletsCount);

	if (!arWalletInstances.length) {
		arWalletInstances = await oMinterHelper.createWallets(iTotalWalletsCount);
		await  oMinterHelper.saveWallets(arWalletInstances);
	} else if (arWalletInstances.length < iTotalWalletsCount) {
		let iDiff = iTotalWalletsCount - arWalletInstances.length;
		arWalletInstances = arWalletInstances.concat(await oMinterHelper.createWallets(iDiff));
		await  oMinterHelper.saveWallets(arWalletInstances);
	}

	if (arWalletInstances.length) {

		// Withdrawal
		if (args.w) {
			// Withdrawal all
			try {
				await (async () => {
//					const oCliProgress = new CliProgress.Bar({
//						format: 'Withdrawal [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total}'
//					}, CliProgress.Presets.shades_grey);
					const sSendToAddress = oConfig.get('sendToAddress') || 'Mx825088777c1f3f1c313ef5e247e187c0f696c439';
					let
							iStartTime = process.hrtime()[0],
							iTxEpoch   = 0,
							iTxDone    = 0,
							iTotalTx   = arWalletInstances.length;

					oLogger.debug('Start Withdrawal Test ');

//					oCliProgress.start(iTotalTx, 0, {
//						fTxPerSec: 0
//					});

					while (arWalletInstances.length) {
						let arWalletsChunk = [];

						iTxEpoch++;

						for (let i = 0; i < iTxEpoch * 5; i++) {
							if (0 >= arWalletInstances.length) break;
							arWalletsChunk.push(arWalletInstances.pop());
						}

						try {
							oLogger.debug(`Start Withdrawal batch  #${iTxEpoch} | ${arWalletsChunk.length} Tx `);

							let arDfdSendChunk = arWalletsChunk.map(async (oWallet) => {
								let sAddress          = oWallet.getAddressString(),
								    fBalance          = await oMinterHelper.getBalance(sAddress),
								    fWithdrawalAmount = fBalance.toFixed(5) - fSendFee;

								if (fSendFee < fWithdrawalAmount) {
									return await oMinterHelper.sendCoinTo(oWallet, sSendToAddress, fWithdrawalAmount);
								}

								return new Promise.resolve(`Not need Withdrawal, wallet empty!`);
							});

							await Promise.all(arDfdSendChunk.map(oUtils.fnReflect)).
									then(results => {
										//let arResolved = results.filter(result => result.resolved);
										let arRejected = results.filter(result => !result.resolved);
										console.log(arRejected, ` Ok: (${results.length - arRejected.length} of ${results.length})`);
									}).
									catch(() => console.log('Withdrawal batch failed'));

							oLogger.debug(`End Withdrawal batch  #${iTxEpoch}`);
						}
						catch (err) {
							oLogger.error(
									`Failed withdrawal batch: Err ${err.message}`);
						}

						iTxDone += arWalletsChunk.length;

						let iEpochTime = process.hrtime()[0];

//						oCliProgress.update(iTxDone, {
//							fTxPerSec: iTxDone / (iEpochTime - iStartTime)
//						});

					}

//					oCliProgress.stop();
					oLogger.debug('End Withdrawal Test ');

				})();
			}
			catch (err) {
				oLogger.error(`Failed withdrawal: Err ${err.message}`);
				process.exit(1);
			}
		}

		// Fund
		else if (args.f) {
			const FundTest = require(sTestsRoot + 'fund_check');
			try {
				await FundTest.run(oMinterHelper, {
							arWallets     : arWalletInstances,
							fSendFee      : fSendFee,
							fFundPerWallet: (fTxAmount + fDelegateFee) * iTotalTxPerWallet
						}
				);
			}
			catch (err) {
				oLogger.error(`Failed Async Funding: ${err.message}`);
				process.exit(1);
			}
		}

		// Send
		else if (args.s) {
			// Send Test
			try {
				await (async () => {
					const oCliProgress = new CliProgress.Bar({
						format: 'Sending Tx block [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total}'
					}, CliProgress.Presets.shades_grey);
					const sSendToAddress = oConfig.get('sendToAddress') || 'Mx825088777c1f3f1c313ef5e247e187c0f696c439';
					let fSendAmount = fTxAmount;

					oLogger.debug('start Sending Test ');

					oCliProgress.start(iTotalTxPerWallet, 0, {
						fTxPerSec: 0
					});
					let iStartTime = process.hrtime()[0];

					for (let iTxEpoch = 1; iTxEpoch <= iTotalTxPerWallet; iTxEpoch++) {

						await Promise.all(arWalletInstances.map(async (oWallet) => {
							let sAddress = oWallet.getAddressString();

							return await oMinterHelper.sendCoinTo(oWallet, sSendToAddress, fSendAmount).
									then((sTxHash) => {
										oLogger.debug(
												`Epoch ${iTxEpoch}/${iTotalTxPerWallet} ${sAddress} => ${sSendToAddress} sTxHash ${sTxHash}`);
										return sTxHash;
									}).
									catch((err) => {
										oLogger.error(`Epoch ${iTxEpoch}/${iTotalTxPerWallet} sAddress: ${sAddress} Err ${err.message}`);
										throw err;
									});
						}));

						let iEpochTime = process.hrtime()[0];

						oCliProgress.update(iTxEpoch, {
							fTxPerSec: (arWalletInstances.length * iTxEpoch) / (iEpochTime - iStartTime)
						});
					}
					oCliProgress.stop();
					oLogger.debug('end Sending Test ');
				})();
			}
			catch (err) {
				oLogger.error(`Failed Send Test: ${err.message}`);
				process.exit(1);
			}
		}

		// Delegate
		else if (args.d) {
			try {
				await (async () => {
//					const oCliProgress = new CliProgress.Bar({
//						format: 'Delegating  [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total}'
//					}, CliProgress.Presets.shades_grey);
					let
							iStartTime = process.hrtime()[0],
							iTxEpoch   = 0,
							iTxDone    = 0,
							iTotalTx   = arWalletInstances.length;

					oLogger.debug('Start Delegating Test ');

//					oCliProgress.start(iTotalTx, 0, {
//						fTxPerSec: 0
//					});

					while (arWalletInstances.length) {
						let arWalletsChunk = [];

						iTxEpoch++;

						for (let i = 0; i < iTxEpoch * 5; i++) {
							if (0 >= arWalletInstances.length) break;
							arWalletsChunk.push(arWalletInstances.pop());
						}

						try {
							oLogger.debug(`Start Delegating batch  #${iTxEpoch} | ${arWalletsChunk.length} Tx `);

							let arDfdSendChunk = arWalletsChunk.map(async (oWallet) => {
								let sAddress        = oWallet.getAddressString(),
								    fBalance        = await oMinterHelper.getBalance(sAddress),
								    fDelegateAmount = fTxAmount,
								    fBalanceRest    = fBalance.toFixed(5) - fDelegateFee;

								if (0 < fBalanceRest) {
									return await oMinterHelper.delegateTo(oWallet, fDelegateAmount);
								}

								return new Promise.reject(new Error(`Not enough tokens!`));
							});

							await Promise.all(arDfdSendChunk.map(oUtils.fnReflect)).
									then(results => {
										let arResolved = results.filter(result => result.resolved);

										console.log(arResolved, ` Ok: (${arResolved.length} of ${results.length})`);
									}).
									catch(() => console.log('Delegating batch failed'));

							oLogger.debug(`End Delegating batch  #${iTxEpoch}`);
						}
						catch (err) {
							oLogger.error(
									`Failed withdrawal batch: Err ${err.message}`);
						}

						iTxDone += arWalletsChunk.length;

						let iEpochTime = process.hrtime()[0];

//						oCliProgress.update(iTxDone, {
//							fTxPerSec: iTxDone / (iEpochTime - iStartTime)
//						});

					}

//					oCliProgress.stop();
					oLogger.debug('End Delegating Test ');

				})();
			}
			catch (err) {
				oLogger.error(`Failed Delegating: Err ${err.message}`);
				process.exit(1);
			}
		}
	}
});

