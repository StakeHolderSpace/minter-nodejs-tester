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
		fSendFee       = 0.01,
		fFundPerWallet = 10;

// Инстанцируем Корневой кошелек
const oRootWallet = oMinterWallet.walletFromMnemonic(oConfig.get('rootWallet:sMnemonic') || '');

/**
 * Функция пополняет кошельки путем деления баланса на 2.
 * Кол-во кошельков на входе должно быть равно степени 2.
 *
 * Возвращает массив пополненых кошельков
 *
 * @param arQueueWallets
 * @returns {Promise<Array>}
 * @constructor
 */
const FundBySplitAlgo = async (arQueueWallets) => {
	let
			iTreeHeight   = Math.floor(Math.log(arQueueWallets.length) / Math.log(2)),//H
			arTreeNodes   = [],
			fTotalSendFee = 0,
			fQueueBudget  = 0,
			arFundedNodes = []; // Пополненые Кошельки из подмножества

	// Формируем удобный массив нод с кошельком и бюджетом на переводы.
	// Заодно подсчитывам полный бюджет накладных расходов на переводы
	fTotalSendFee = iTreeHeight * fSendFee;
	let oWallet = arQueueWallets.shift();
	arTreeNodes.push({
		oWallet         : oWallet,
		fTxFeeBudget    : fTotalSendFee,
		fBalance        : 0
	});

	//
	for (let i = 1; i <= iTreeHeight; i++) {
		let iNodeRowCnt = Math.pow(2, i - 1);
		let fNodeTxFeeBudget = (iTreeHeight - i) * fSendFee;

		fTotalSendFee += fNodeTxFeeBudget * iNodeRowCnt;

		for (let n = 0; n < iNodeRowCnt; n++) {
			let oWallet = arQueueWallets.shift();
			arTreeNodes.push({
				oWallet         : oWallet,
				fTxFeeBudget    : fNodeTxFeeBudget,
				fBalance        : 0
			});
		}
	}

	// Считаем полный бюджет нужный для текущего дерева
	fQueueBudget = fFundPerWallet * arTreeNodes.length + fTotalSendFee;

	// Пополняем первый кошелек общим бюджетом
	let oNodeTo = arTreeNodes.shift();
	let sWalletToAddress = oNodeTo.oWallet.getAddressString();

	await oMinterHelper.sendCoinTo(oRootWallet, sWalletToAddress, fQueueBudget).
			then((arSendResult) => {
				oNodeTo.fBalance = fQueueBudget;
				arFundedNodes.push(oNodeTo);

				oLogger.debug(`Success Root Wallet fund  ${arSendResult.from} => ${arSendResult.to} ${arSendResult.amount} (${arSendResult.txHash})`);
			});

	oNodeTo = null;

	// Асинхронно Пополняем все остальные, делением 2
	let iHeight = 0;
	while (arTreeNodes.length) {

		//
		let arDfdSendChunk = arFundedNodes.map(async (oNodeFrom) => {
			let oNodeTo = arTreeNodes.shift();
			if (!oNodeTo) {
				return Promise.resolve();
			}

			let
					fNodeFromBalance   = oNodeFrom.fBalance, /*await oMinterHelper.getBalance(sWalletFromAddress),*/
					sWalletToAddress   = oNodeTo.oWallet.getAddressString(),
					fFundAmount        = (fNodeFromBalance - oNodeFrom.fTxFeeBudget) / 2;

			return oMinterHelper.sendCoinTo(oNodeFrom.oWallet, sWalletToAddress, fFundAmount).
					then((arSendResult) => {
						oNodeFrom.fBalance = fNodeFromBalance - fFundAmount;
						oNodeTo.fBalance = fFundAmount;

						arFundedNodes.push(oNodeTo);

						oLogger.debug(
								`Success fund ${arSendResult.from} => ${arSendResult.to} ${arSendResult.amount} (${arSendResult.txHash})`);

						return arSendResult;
					});

		});

		await Promise.all(arDfdSendChunk.map(oUtils.fnReflect)).
				then(results => {
					//let arResolved = results.filter(result => result.resolved);
					let arRejected = results.filter(result => !result.resolved);

					console.log({
						//arResolved: arResolved,
						arRejected: arRejected,
						Ok        : `(${results.length-arRejected.length} of ${results.length})`,
						//Rejected  : `(${arRejected.length} of ${results.length})`
					});
				}).
				catch(() => console.log('Funding batch failed'));

		oLogger.debug(
				`Epoch #${iHeight} done`);

		iHeight++;
	}

	return arFundedNodes;
};

const FundWallets = async (arWallets) => {
	const oCliProgress = new CliProgress.Bar({
		format : 'Funding wallets [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}',
		barsize: 65
	}, CliProgress.Presets.shades_grey);
	let arFundedWallets = [];

	//oCliProgress.start(arWallets.length, 0);

	// Разбиваем очередь кошельков на блоки с количеством пригодным для алгоритма. И пополняем.
	while (arWallets.length) {
		let
				iTreeHeight    = Math.floor(Math.log(arWallets.length) / Math.log(2)),//H
				iTreeNodesCnt  = Math.pow(2, iTreeHeight),//N
				arChunkWallets = []; // Подмножество Кошельков на пополнение

		// Выбираем подмножество кошельков пригодное для алгоритма (кол-во важно)
		for (let i = 0; i < iTreeNodesCnt; i++) {
			arChunkWallets.push(arWallets.pop());
		}

		arFundedWallets = arFundedWallets.concat(await FundBySplitAlgo(arChunkWallets));

		oCliProgress.update(arFundedWallets.length);
	}

	//oCliProgress.stop();

	return arFundedWallets;
};

const Exec = async (_oMinterHelper, oParams) => {
	oMinterHelper = _oMinterHelper || null;

	arWallets = oParams.arWallets || [];
	fSendFee = oParams.fSendFee || 0.01;
	fFundPerWallet = oParams.fFundPerWallet || 10;

	oLogger.debug('start Funding ');
	/* Синхронное пополнение
				for (const oWallet of arWallets) {
					let sAddress = oWallet.getAddressString();

					await oMinterHelper.sendCoinTo(oRootWallet, sAddress, fFundPerWallet).then((sTxHash) => {
						oLogger.debug(`Success sent ${fFundPerWallet} to sAddress: ${sAddress} sTxHash ${sTxHash}`);
					}).catch((err) => {
						oLogger.error(`Failed to send ${fFundPerWallet} to sAddress: ${sAddress}  Err ${err.message}`);
					});
				}
	*/

	arWallets = await FundWallets(arWallets);

	// Дайджест балансов
//			await Promise.all(arWallets.map(async (oWallet) => {
//				let fBalance = await oMinterHelper.getBalance(oWallet.getAddressString());
//				oLogger.info(`Wal: ${oWallet.getAddressString()} Balance: ${fBalance}`);
//			}));

	oLogger.debug('end Funding ');
};

module.exports = {
	run: Exec
};