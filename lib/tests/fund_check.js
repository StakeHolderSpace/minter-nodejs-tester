'use strict';
require = require('esm')(module);

const
		oPath         = require('path'),
		sUtilsRoot    = oPath.join(__dirname, '../utils/'),
		Promise       = require('bluebird'),
		CliProgress   = require('cli-progress'),
		oConfig       = require(sUtilsRoot + 'nconf'),
		oUtils        = require(sUtilsRoot + 'utils'),
		oLogger       = require(sUtilsRoot + 'winston')(module),
		oMinterWallet = require('minterjs-wallet');

let
		oMinterHelper  = null,
		arWallets      = [],
		arCheckBook    = [],
		fSendFee       = 0.01,
		fFundPerWallet = 10,
		bIsDebugMode   = false;

// Инстанцируем Корневой кошелек
const oRootWallet = oMinterWallet.walletFromMnemonic(oConfig.get('rootWallet:sMnemonic') || '');

/**
 *
 * @param iCount
 * @param fValue
 * @returns {Promise<T | void>}
 * @constructor
 */
const IssueChecks = async (iCount, fValue) => {
	oLogger.debug('start IssueChecks ');

	let
			_iCount      = parseInt(iCount) || 1,
			_fValue      = parseInt(fValue) || 1,
			arDfdTxChunk = [];

	for (let i = 0; i < _iCount; i++) {
		//
		arDfdTxChunk.push(
				(async (oWalletFrom) => {
					return await oMinterHelper.issueCheck(oWalletFrom, _fValue).then(sCheck => {

						return sCheck;
					});
				})(oRootWallet)
		);
	}

	return await Promise.all(arDfdTxChunk.map(oUtils.fnReflect)).
			then(results => {
				let arResolved = results.filter(result => result.resolved);

				return arResolved.map((result) => {
					return result.payload;
				});
			}).
			catch(() => console.log('IssueChecks batch failed'));

};

/**
 *
 * @param arWallets
 * @param arCheckBook
 * @returns {Promise<Array>}
 * @constructor
 */
const FundWallets = async (arWallets, arCheckBook) => {
	oLogger.debug('start Funding ');

	const oCliProgress = new CliProgress.Bar({
		format : 'Funding wallets [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}',
		barsize: 65
	}, CliProgress.Presets.shades_grey);
	let arFundedWallets = [];
	let iChunkSize = Math.round(arWallets.length / 10);

	if (!bIsDebugMode) {
		oCliProgress.start(arWallets.length, 0);
	}
	// Разбиваем очередь кошельков на блоки с количеством пригодным для алгоритма. И пополняем.
	while (arWallets.length) {
		let arChunkChecks = []; // Подмножество Кошельков на пополнение

		// Выбираем подмножество кошельков пригодное для алгоритма (кол-во важно)
		for (let i = 0; i < iChunkSize; i++) {
			if (0 >= arWallets.length || 0 >= arCheckBook.length) break;

			arChunkChecks.push({
				oWallet: arWallets.pop(),
				sCheck : arCheckBook.pop(),
				sTxHash: ''
			});
		}

		let arDfdRedeemChunk = arChunkChecks.map(async (oCheck) => {
			return oMinterHelper.redeemCheck(oCheck.oWallet, oCheck.sCheck).then(sTxHash => {
				oCheck.sTxHash = sTxHash;
				return oCheck;
			});
		});

		arFundedWallets = arFundedWallets.concat(
				await Promise.all(arDfdRedeemChunk.map(oUtils.fnReflect)).
						then(results => {
							let arResolved = results.filter(result => result.resolved);

							if (bIsDebugMode) {
								let arRejected = results.filter(result => !result.resolved);
								oLogger.debug({arRejected: arRejected});
							}

							return arResolved.map((result) => {
								return result.payload;
							});
						}).
						catch(() => {
							oLogger.error('RedeemCheck batch failed');
							return [];
						})
		);

		if (!bIsDebugMode) {
			oCliProgress.update(arFundedWallets.length);
		}
	}

	if (!bIsDebugMode) {
		oCliProgress.stop();
	}

	oLogger.debug('end Funding ');

	return arFundedWallets;
};

/**
 *
 * @param _oMinterHelper
 * @param oParams
 * @returns {Promise<Array>}
 * @constructor
 */
const Exec = async (_oMinterHelper, oParams) => {
	oMinterHelper = _oMinterHelper || null;

	arWallets = oParams.arWallets || [];
	fSendFee = oParams.fSendFee || 0.01;
	fFundPerWallet = oParams.fFundPerWallet || 10;

	if (null !== oMinterHelper) {
		arCheckBook = await IssueChecks(arWallets.length, fFundPerWallet);

		return await FundWallets(arWallets, arCheckBook);
	}

	return Promise.resolve();
};

module.exports = {
	run: Exec
};