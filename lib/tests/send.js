'use strict';
require = require('esm')(module);

const
		oPath         = require('path'),
		sUtilsRoot    = oPath.join(__dirname, '../utils/'),
		Promise       = require('bluebird'),
		CliProgress   = require('cli-progress'),
		oConfig       = require(sUtilsRoot + 'nconf'),
		oUtils        = require(sUtilsRoot + 'utils'),
		oLogger       = require(sUtilsRoot + 'winston')(module);

let
		oMinterHelper     = null,
		arWallets         = [],
		iTotalTxPerWallet = 1,
		fSendAmount       = 0.1,
		fSendFee          = 0.01,
		bIsDebugMode      = false;

/**
 *
 * @param fSendAmount
 * @param iTotalTxPerWallet
 * @returns {Promise<void>}
 * @constructor
 */
const Send = async (fSendAmount, iTotalTxPerWallet) => {
	oLogger.debug('start Sending Test ');

	const oCliProgress = new CliProgress.Bar({
		format: 'Sending Tx block [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total}'
	}, CliProgress.Presets.shades_grey);
	const sSendToAddress = oConfig.get('sendToAddress') || 'Mx825088777c1f3f1c313ef5e247e187c0f696c439';

	if (!bIsDebugMode) {
		oCliProgress.start(iTotalTxPerWallet, 0, {
			fTxPerSec: 0
		});
	}

	let iStartTime = process.hrtime()[0];

	for (let iTxEpoch = 1; iTxEpoch <= iTotalTxPerWallet; iTxEpoch++) {

		await Promise.all(arWallets.map(async (oWallet) => {
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

		if (!bIsDebugMode) {

			let iEpochTime = process.hrtime()[0];
			oCliProgress.update(iTxEpoch, {
				fTxPerSec: (arWallets.length * iTxEpoch) / (iEpochTime - iStartTime)
			});
		}

	}

	if (!bIsDebugMode) {
		oCliProgress.stop();
	}

	oLogger.debug('end Sending Test ');
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
	fSendFee = oParams.fSendFee || 0.01;
	fSendAmount = oParams.fSendAmount || 0.1;
	iTotalTxPerWallet = oParams.iTotalTxPerWallet || 1;

	if (null !== oMinterHelper) {

		return await Send(fSendAmount, iTotalTxPerWallet);
	}

	return Promise.resolve();
};

module.exports = {
	run: Exec
};