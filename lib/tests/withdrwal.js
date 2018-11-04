'use strict';
require = require('esm')(module);

const
		oPath       = require('path'),
		sUtilsRoot  = oPath.join(__dirname, '../utils/'),
		Promise     = require('bluebird'),
		CliProgress = require('cli-progress'),
		oConfig     = require(sUtilsRoot + 'nconf'),
		oUtils      = require(sUtilsRoot + 'utils'),
		oLogger     = require(sUtilsRoot + 'winston')(module);

let
		oMinterHelper = null,
		arWallets     = [],
		fSendFee      = 0.01,
		bIsDebugMode  = false;

const doWithdrawal = async (arWallets) => {
	const oCliProgress = new CliProgress.Bar({
		format: 'Withdrawal [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total}'
	}, CliProgress.Presets.shades_grey);

	oLogger.debug('Start Withdrawal Test ');

	const sSendToAddress = oConfig.get('sendToAddress') || 'Mx825088777c1f3f1c313ef5e247e187c0f696c439';

	let
			iStartTime = process.hrtime()[0],
			iTxEpoch   = 0,
			iTxDone    = 0,
			iTotalTx   = arWallets.length;

	if (!bIsDebugMode) {
		oCliProgress.start(iTotalTx, 0, {
			fTxPerSec: 0
		});
	}

	while (arWallets.length) {
		let arWalletsChunk = [];

		iTxEpoch++;

		for (let i = 0; i < iTxEpoch * 5; i++) {
			if (0 >= arWallets.length) break;
			arWalletsChunk.push(arWallets.pop());
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

				return new Promise.resolve({msg: `Not need Withdrawal, wallet empty!`});
			});

			await Promise.all(arDfdSendChunk.map(oUtils.fnReflect)).
					then(results => {
						//let arResolved = results.filter(result => result.resolved);
						let arRejected = results.filter(result => !result.resolved);
						oLogger.debug(arRejected, ` Ok: (${results.length - arRejected.length} of ${results.length})`);
					}).
					catch(() => oLogger.debug('Withdrawal batch failed'));

			oLogger.debug(`End Withdrawal batch  #${iTxEpoch}`);
		}
		catch (err) {
			oLogger.error(
					`Failed withdrawal batch: Err ${err.message}`);
		}

		iTxDone += arWalletsChunk.length;

		let iEpochTime = process.hrtime()[0];

		if (!bIsDebugMode) {
			oCliProgress.update(iTxDone, {
				fTxPerSec: iTxDone / (iEpochTime - iStartTime)
			});
		}

	}

	if (!bIsDebugMode) {
		oCliProgress.stop();
	}

	oLogger.debug('End Withdrawal Test ');
};

const Exec = async (_oMinterHelper, oParams) => {
	oMinterHelper = _oMinterHelper || null;

	arWallets = oParams.arWallets || [];

	if (null !== oMinterHelper) {
		return await doWithdrawal(arWallets);
	}

	return Promise.resolve();
};

module.exports = {
	run: Exec
};
