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
		oMinterHelper     = null,
		arWallets         = [],
		fDelegateAmount   = 0.1,
		fDelegateFee      = 0.01,
		bIsDebugMode      = false;

const Delegate = async (fDelegateAmount) => {
	oLogger.debug('Start Delegating Test ');

	const oCliProgress = new CliProgress.Bar({
		format: 'Delegating  [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total}'
	}, CliProgress.Presets.shades_grey);
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
			oLogger.debug(`Start Delegating batch  #${iTxEpoch} | ${arWalletsChunk.length} Tx `);

			let arDfdSendChunk = arWalletsChunk.map(async (oWallet) => {
				let sAddress     = oWallet.getAddressString(),
				    fBalance     = await oMinterHelper.getBalance(sAddress),
				    fBalanceRest = fBalance.toFixed(8) - fDelegateFee;

				if (fDelegateAmount <= fBalanceRest) {
					return await oMinterHelper.delegateTo(oWallet, fDelegateAmount);
				}

				return new Promise.reject(new Error(`Not enough tokens!`));
			});

			await Promise.all(arDfdSendChunk.map(oUtils.fnReflect)).
					then(results => {
						let arRejected = results.filter(result => !result.resolved);

						oLogger.debug(arRejected, ` Ok: (${results.length - arRejected.length} of ${results.length})`);
					}).
					catch(() => oLogger.error('Delegating batch failed'));

			oLogger.debug(`End Delegating batch  #${iTxEpoch}`);
		}
		catch (err) {
			oLogger.error(
					`Failed withdrawal batch: Err ${err.message}`);
		}

		if (!bIsDebugMode) {
			iTxDone += arWalletsChunk.length;

			let iEpochTime = process.hrtime()[0];

			oCliProgress.update(iTxDone, {
				fTxPerSec: iTxDone / (iEpochTime - iStartTime)
			});
		}
	}

	if (!bIsDebugMode) {
		oCliProgress.stop();
	}

	oLogger.debug('End Delegating Test ');

};

/**
 *
 * @param _oMinterHelper
 * @param oParams
 * @returns {Promise<void>}
 * @constructor
 */
const Exec = async (_oMinterHelper, oParams) => {
	oMinterHelper = _oMinterHelper || null;

	arWallets = oParams.arWallets || [];
	fDelegateFee = oParams.fDelegateFee || 0.01;
	fDelegateAmount = oParams.fDelegateAmount || 0.1;

	if (null !== oMinterHelper) {

		return await Delegate(fDelegateAmount);
	}

	return Promise.resolve();
};

module.exports = {
	run: Exec
};