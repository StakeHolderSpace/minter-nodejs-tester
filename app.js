// for debuging add to console command before run app.js : set NODE_ENV=development
//"http://35.205.94.100:8841"
'use strict';
const axios = require('axios');

require = require('esm')(module);

const
		minimist      = require('minimist'),
		args          = minimist(process.argv.slice(2), {
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
		oPath         = require('path'),
		oFs           = require('fs'),
		CliProgress   = require('cli-progress'),
		_Has          = require('lodash.has'),
		Promise       = require('bluebird'),
		sUtilsRoot    = oPath.join(__dirname, './lib/utils/'),
		oConfig       = require(sUtilsRoot + 'nconf'),
		oUtils        = require(sUtilsRoot + 'utils'),
		oLogger       = require(sUtilsRoot + 'winston')(module),
		oMinterWallet = require('minterjs-wallet'),
		oMinterSdk    = require('minter-js-sdk');

process.env.NODE_ENV = (oConfig.get('verbose')) ? 'development' : '';
process.title = 'StakeHolder Overload Tests';
process.on('uncaughtException', function(err) {
	oLogger.error('Caught exception: ' + err, err.stack.split('\n'));
	return false;
});

// Инстанцируем Корневой кошелек
const oRootWallet = oMinterWallet.walletFromMnemonic(oConfig.get('rootWallet:sMnemonic') || '');
const sDelegateToNodePubKey = oConfig.get('delegateToNodePubKey') ||
		'Mp8f053f3802d33f5e7092bb01ca99ae77606f4faf759c72560d5ee69b8e191a56';

const fnReflect = promise => promise.
		then(result => ({payload: result, resolved: true})).
		catch(error => ({payload: error, resolved: false}));

// ==============================================================================
/*
process.title = 'StakeHolder Overload Tester';
process.on('uncaughtException', function(err) {
	oLogger.error('Caught exception: ' + err, err.stack.split('\n'));
	return false;
});
*/
const App = (function() {
	const iPipDivider = Math.pow(10, 18);
	let oHttpClient = null;
	let arMinterNodeList = [];

	/**
	 *
	 * @constructor
	 */
	function App() {
		let self = this;

	}

	/**
	 *
	 * @param arMinterNodeList
	 * @returns {Promise<*>}
	 */
	App.prototype.randomUrl = async function(arMinterNodeList) {

		return arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)];

	};

	/**
	 *
	 * @param iTotalWalletsCount
	 * @returns {Promise<Array>}
	 */
	App.prototype.createWallets = async function(iTotalWalletsCount = 1) {
		let _iTotalWalletsCount = parseInt(iTotalWalletsCount) || 1;
		const arWalletInstances = [];
		const oCliProgress = new CliProgress.Bar({
			format : 'Creating wallets [{bar}] {percentage}% | {value}/{total}',
			barsize: 65
		}, CliProgress.Presets.shades_grey);

		oCliProgress.start(_iTotalWalletsCount, 0);
		for (let i = 0; i < _iTotalWalletsCount; i++) {
			arWalletInstances.push(oMinterWallet.generateWallet());
			oCliProgress.update(arWalletInstances.length);
		}
		oCliProgress.stop();

		return arWalletInstances;
	};

	/**
	 *
	 * @param arWalletInstances
	 * @param sPathToWalletsFile
	 * @returns {Promise<undefined>}
	 */
	App.prototype.saveWallets = async function(arWalletInstances = [], sPathToWalletsFile = './config/wallets.json') {
		let sDefaultWalletsPath = oPath.join(__dirname, oConfig.get('pathToWalletsFile') || './config/wallets.json');
		const _sPathToWalletsFile = sPathToWalletsFile || sDefaultWalletsPath;

		let sJsonWallets = JSON.stringify(arWalletInstances.reduce((arResult, oWallet) => {
			if (oWallet instanceof oMinterWallet.default) {
				arResult.push({
					'sAddress' : oWallet.getAddressString(),
					'sMnemonic': oWallet.getMnemonic()
				});
			}
			return arResult;
		}, []));

		return oFs.writeFile(_sPathToWalletsFile, sJsonWallets, 'utf8', (err) => {
		});
	};

	/**
	 *
	 * @param sPathToWalletsFile
	 * @param iCount
	 * @returns {Promise<Array>}
	 */
	App.prototype.loadWallets = async function(iCount = null, sPathToWalletsFile) {
		let sDefaultWalletsPath = oPath.join(__dirname, oConfig.get('pathToWalletsFile') || './config/wallets.json');
		const _sPathToWalletsFile = sPathToWalletsFile || sDefaultWalletsPath;
		const arWalletInstances = [];

		if (oUtils.fileExists(_sPathToWalletsFile)) {
			// Открываем файл кошельков и выбираем данные о кошельках
			let sJson = oFs.readFileSync(_sPathToWalletsFile, 'utf8');

			if (sJson.length) {
				try {
					let arWallets = JSON.parse(sJson);
					const oCliProgress = new CliProgress.Bar({
						format : 'Loading wallets [{bar}] {percentage}% | {value}/{total}',
						barsize: 65
					}, CliProgress.Presets.shades_grey);
					iCount = 0 < parseInt(iCount) ? parseInt(iCount) : arWallets.length;

					oCliProgress.start(iCount, 0);

					arWallets.forEach((oWalletData) => {
						if (0 >= iCount) return;

						try {
							arWalletInstances.push(oMinterWallet.walletFromMnemonic(oWalletData.sMnemonic));
							oCliProgress.update(arWalletInstances.length);
							iCount--;
						}
						catch (err) {
							oLogger.error(err.message);
						}
					});

					oCliProgress.stop();
				}
				catch (err) {
					oLogger.error(err.message);
				}
			}
		}

		return arWalletInstances;
	};

	/**
	 *
	 * @param sPathToAddressBook
	 * @returns {Promise<*>}
	 */
	App.prototype.loadAddressBook = async function(sPathToAddressBook) {
		const oSelf = this;
		const sDefaultPath = oPath.join(__dirname, oConfig.get('pathToAddressBook') || './config/addrbook.json');
		const _sPathToAddressBook = sPathToAddressBook || sDefaultPath;
		let arMinterNodeList = [];
		let arFallbackNodeList = Array.from(oConfig.get('fallbackNodeList'));

		let dfdNodeCheck = arFallbackNodeList.map(async (sAddress) => {
			return await oSelf.checkNode(sAddress).then(async (code) => {
				return {
					sAddress: sAddress,
					iCode   : code
				};
			});
		});

		await Promise.all(dfdNodeCheck.map(fnReflect)).then(results => {
			arMinterNodeList = arMinterNodeList.concat(
					results.reduce((arResult, oNodeCheckData) => {
						if (oNodeCheckData.resolved && 0 === oNodeCheckData.payload.iCode) {
							arResult.push(oNodeCheckData.payload.sAddress);
						}
						return arResult;
					}, [])
			);
		}).catch(() => console.log('Fallback Node list check failed'));

		if (oUtils.fileExists(_sPathToAddressBook)) {
			// Открываем файл кошельков и выбираем данные о кошельках
			let sJson = oFs.readFileSync(_sPathToAddressBook, 'utf8');

			if (sJson.length) {
				try {
					let oAddrBook = JSON.parse(sJson);
					const oCliProgress = new CliProgress.Bar({
						format : 'Loading AddressBook [{bar}] {percentage}% | {value}/{total}',
						barsize: 65
					}, CliProgress.Presets.shades_grey);

					oCliProgress.start(oAddrBook.addrs.length + arMinterNodeList.length, 0);

					let dfdNodeCheck = oAddrBook.addrs.map(async (oNodeData) => {
						let sAddress = `http://${oNodeData.addr.ip}:8841`;
						return await oSelf.checkNode(sAddress).then(async (code) => {
							return {
								sAddress: sAddress,
								iCode   : code
							};
						});
					});

					await Promise.all(dfdNodeCheck.map(fnReflect)).then(results => {

						arMinterNodeList = arMinterNodeList.concat(results.reduce((arResult, oNodeCheckData) => {
							if (oNodeCheckData.resolved && 0 === oNodeCheckData.payload.iCode) {
								arResult.push(oNodeCheckData.payload.sAddress);
							}
							return arResult;
						}, []));

						oCliProgress.update(arMinterNodeList.length);

					}).catch(() => console.log('AddrBook Check batch failed'));

					oCliProgress.stop();

				}
				catch (err) {
					oLogger.error(err.message);
				}
			}
		}

		arMinterNodeList = [...new Set(arMinterNodeList)];

		console.log({
			'arMinterNodeList': arMinterNodeList
		});

		return arMinterNodeList;
	};

	/**
	 *
	 * @param oWallet
	 * @param iDelegateAmount
	 */
	App.prototype.delegateTo = async function(oWallet, iDelegateAmount) {
		let
				iAmount   = iDelegateAmount || 0.1,
				sNodeUrl  = await this.randomUrl(arMinterNodeList),
				oPostTx   = null,
				oTxParams = null;

		if ((oWallet instanceof oMinterWallet.default) && sDelegateToNodePubKey.length) {
			oPostTx = new oMinterSdk.PostTx({baseURL: sNodeUrl, timeout: 5000});
			oTxParams = new oMinterSdk.DelegateTxParams({
				privateKey   : oWallet.getPrivateKeyString(),
				publicKey    : sDelegateToNodePubKey,
				coinSymbol   : 'MNT',
				stake        : iAmount,
				feeCoinSymbol: 'MNT',
				message      : ''
			});

			return oPostTx(oTxParams).then(async (response) => {
				return response.data.result.hash;
			}).catch((err) => {
				let sErrorMessage = err.message;
				if (_Has(err, 'response.data.log')) {
					sErrorMessage += '\n ' + err.response.data.log;
				}

				throw new Error(sErrorMessage);
			});

		}
		else {
			throw new Error('Wrong wallet or empty node PubKey');
		}

	};

	/**
	 *
	 * @param oWalletFrom
	 * @param sToAddress
	 * @param fAmount
	 * @returns {Promise<T>}
	 */
	App.prototype.sendCoinTo = async function(oWalletFrom, sToAddress, fAmount) {
		let
				_fAmount  = parseFloat(fAmount) || 1,
				sNodeUrl  = await this.randomUrl(arMinterNodeList),
				oPostTx   = null,
				oTxParams = null;

		if ((oWalletFrom instanceof oMinterWallet.default) && 0 < _fAmount) {
			let _sToAddress = sToAddress || oWalletFrom.getAddressString();
			let sFromAddress = oWalletFrom.getAddressString();
			let oResult = {};

			oPostTx = new oMinterSdk.PostTx({baseURL: sNodeUrl, timeout: 5000});
			oTxParams = new oMinterSdk.SendTxParams({
				privateKey   : oWalletFrom.getPrivateKeyString(),
				address      : _sToAddress,
				amount       : _fAmount,
				coinSymbol   : 'MNT',
				feeCoinSymbol: 'MNT',
				message      : ''
			});

			return oPostTx(oTxParams).then((response) => {
				return {
					from  : sFromAddress,
					to    : _sToAddress,
					amount: _fAmount,
					txHash: response.data.result.hash
				};
			}).catch((err) => {
				let sErrorMessage = `(${sNodeUrl}) ${err.message}`;

				if (_Has(err, 'response.data.log')) {
					sErrorMessage += `\n ${err.response.data.log}`;
				}

				oResult = {
					from  : sFromAddress,
					to    : _sToAddress,
					amount: _fAmount,
					err   : sErrorMessage
				};

				throw new Error(JSON.stringify(oResult, undefined, 2));
			});
		}
		else {
			throw new Error(`Wrong WalletFrom or wrong amount (${_fAmount})`);
		}

	};

	/**
	 *
	 * @param sAddress
	 * @returns {Promise<number>}
	 */
	App.prototype.getBalance = async function(sAddress) {
		let
				sNodeUrl    = await this.randomUrl(arMinterNodeList),
				oHttpClient = axios.create({baseURL: sNodeUrl, timeout: 2500});

		return oHttpClient.get(`/api/balance/${sAddress}`).then((response) => {
			let fBalance = Number(response.data.result.balance.MNT) / iPipDivider;
			oLogger.debug(`sAddress ${sAddress} balance ${fBalance}`);

			return fBalance;
		});
	};

	/**
	 *
	 * @param sAddress
	 * @returns {Promise<number>}
	 */
	App.prototype.checkNode = async function(sAddress) {
		let oHttpClient = axios.create({
			baseURL: sAddress,
			timeout: 5000
		});

		return oHttpClient.get('/api/status').then((response) => {

			if (0 === response.data.code && !response.data.result.tm_status.sync_info.catching_up) {
				return 0;
			}

			throw new Error('not synced');
		});
	};

	/**
	 *
	 * @returns {Promise<string>}
	 */
	App.prototype.init = async function() {
		process.stdout.write('\x1Bc');
		// prepare NodeList
		arMinterNodeList = await oApp.loadAddressBook();
		oHttpClient = axios.create({baseURL: arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)]});

		return Promise.resolve();
	};

	return App;

}());

const oApp = new App;

oApp.init().then(async () => {

	const
			fSendFee           = 0.01,
			fDelegateFee       = 0.2,
			fTxAmount          = 0.1,
			iTotalTestDuration = parseInt(oConfig.get('totalTestDuration')) || 60,// seconds
			iTotalTxPerWallet  = Math.round(iTotalTestDuration / 5),
			fFundPerWallet     = (fTxAmount + fDelegateFee) * iTotalTxPerWallet,
			iTotalWalletsCount = parseInt(oConfig.get('totalSimultaneousTx')) || 10;// workers

	// prepare Wallets
	let arWalletInstances = await oApp.loadWallets(iTotalWalletsCount);
	if (!arWalletInstances.length) {
		arWalletInstances = await oApp.createWallets(iTotalWalletsCount);
		await  oApp.saveWallets(arWalletInstances);
	} else if (arWalletInstances.length < iTotalWalletsCount) {
		let iDiff = iTotalWalletsCount - arWalletInstances.length;
		arWalletInstances = arWalletInstances.concat(await oApp.createWallets(iDiff));
		await  oApp.saveWallets(arWalletInstances);
	}

	if (arWalletInstances.length) {

		//
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
								    fBalance          = await oApp.getBalance(sAddress),
								    fWithdrawalAmount = fBalance.toFixed(5) - fSendFee;

								if (fSendFee < fWithdrawalAmount) {
									return await oApp.sendCoinTo(oWallet, sSendToAddress, fWithdrawalAmount);
								}

								return new Promise.reject(new Error(`Not enough tokens!`));
							});

							await Promise.all(arDfdSendChunk.map(fnReflect)).
									then(results => {
										let arResolved = results.filter(result => result.resolved);
										console.log(arResolved, ` Ok: (${arResolved.length} of ${results.length})`);
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
		//
		else if (args.f) {
			// Fund
			try {
				await (async () => {
					oLogger.debug('start Funding ');
					/* Синхронное пополнение
								for (const oWallet of arWalletInstances) {
									let sAddress = oWallet.getAddressString();

									await oApp.sendCoinTo(oRootWallet, sAddress, fFundPerWallet).then((sTxHash) => {
										oLogger.debug(`Success sent ${fFundPerWallet} to sAddress: ${sAddress} sTxHash ${sTxHash}`);
									}).catch((err) => {
										oLogger.error(`Failed to send ${fFundPerWallet} to sAddress: ${sAddress}  Err ${err.message}`);
									});
								}
					*/

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

						// Формируем удобный массив нод дерева с кошельком и бюджетом на переводы.
						// Заодно подсчитывам полный бюджет накладных расходов на переводы
						fTotalSendFee = iTreeHeight * fSendFee;
						arTreeNodes.push({
							oWallet         : arQueueWallets.shift(),
							fTxFeeBudget    : fTotalSendFee,
							fBalance        : 0,
							iTxCount        : 0,
							iLastSplitHeight: 0
						});

						for (let i = 1; i <= iTreeHeight; i++) {
							let iNodeWalletCnt = Math.pow(2, i - 1);
							let fNodeTxFeeBudget = (iTreeHeight - i) * fSendFee;

							for (let n = 0; n < iNodeWalletCnt; n++) {
								arTreeNodes.push({
									oWallet         : arQueueWallets.shift(),
									fTxFeeBudget    : fNodeTxFeeBudget,
									fBalance        : 0,
									iTxCount        : 0,
									iLastSplitHeight: 0
								});
							}

							fTotalSendFee += fNodeTxFeeBudget * iNodeWalletCnt;
						}

						// Считаем полный бюджет нужный для текущего дерева
						fQueueBudget = fFundPerWallet * arTreeNodes.length + fTotalSendFee;

						// Пополняем первый кошелек общим бюджетом
						let oNodeTo = arTreeNodes.shift();
						let sWalletToAddress = oNodeTo.oWallet.getAddressString();
						await oApp.sendCoinTo(oRootWallet, sWalletToAddress, fQueueBudget).then((sTxHash) => {
							oNodeTo.fBalance = fQueueBudget;
							arFundedNodes.push(oNodeTo);
							oLogger.debug(`Success Root fund ${sWalletToAddress} ${fQueueBudget} (${sTxHash})`);
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
										fNodeFromBalance = oNodeFrom.fBalance, /*await oApp.getBalance(sWalletFromAddress),*/
										sWalletToAddress = oNodeTo.oWallet.getAddressString(),
										fFundAmount      = (fNodeFromBalance - oNodeFrom.fTxFeeBudget) / 2;

								/*
																console.log({
																	'sWalletToAddress'  : sWalletToAddress,
																	'sWalletFromAddress': sWalletFromAddress,
																	'fNodeFromBalance'  : fNodeFromBalance,
																	'fTxFeeBudget'      : oNodeFrom.fTxFeeBudget,
																	'fFundAmount'       : fFundAmount,
																	'fFundPerWallet'    : fFundPerWallet
																});
								*/
								return await oApp.sendCoinTo(oNodeFrom.oWallet, sWalletToAddress, fFundAmount).then((sTxHash) => {
									oNodeFrom.fBalance = fNodeFromBalance - fFundAmount;
									oNodeFrom.fTxFeeBudget -= fSendFee;
									oNodeFrom.iTxCount++;
									oNodeFrom.iLastSplitHeight = iHeight;

									oNodeTo.fBalance = fFundAmount;

									arFundedNodes.push(oNodeTo);

								}).catch(err => {

								});

							});

							await Promise.all(arDfdSendChunk.map(fnReflect)).
									then(results => {
										let arResolved = results.filter(result => result.resolved);

										console.log(arFundedNodes, ` Ok: (${arResolved.length} of ${results.length})`);
									}).
									catch(() => console.log('Funding batch failed'));

							iHeight++;
						}

						return arFundedNodes;
					};

					// Асинхронное пополнение Разбиением на 2
					arWalletInstances = await (async () => {
						const oCliProgress = new CliProgress.Bar({
							format : 'Funding wallets [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}',
							barsize: 65
						}, CliProgress.Presets.shades_grey);
						let arFundedWallets = [];
						oCliProgress.start(arWalletInstances.length, 0);

						while (arWalletInstances.length) {
							let
									iTreeHeight    = Math.floor(Math.log(arWalletInstances.length) / Math.log(2)),//H
									iTreeNodesCnt  = Math.pow(2, iTreeHeight),//N
									arChunkWallets = []; // Подмножество Кошельков на пополнение

							// Выбираем подмношество кошельков пригодное для алгоритма (кол-во важно)
							for (let i = 0; i < iTreeNodesCnt - 1; i++) {
								arChunkWallets.push(arWalletInstances.pop());
							}

							arFundedWallets = arFundedWallets.concat(await FundBySplitAlgo(arChunkWallets));

							oCliProgress.update(arFundedWallets.length);
						}

						oCliProgress.stop();
						return arFundedWallets;
					})();

					// Дайджест балансов
//			await Promise.all(arWalletInstances.map(async (oWallet) => {
//				let fBalance = await oApp.getBalance(oWallet.getAddressString());
//				oLogger.info(`Wal: ${oWallet.getAddressString()} Balance: ${fBalance}`);
//			}));

					oLogger.debug('end Funding ');

				})();
			}
			catch (err) {
				oLogger.error(`Failed Async Funding: ${err.message}`);
				process.exit(1);
			}
		}
		//
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

							return oApp.sendCoinTo(oWallet, sSendToAddress, fSendAmount).then((sTxHash) => {
								oLogger.debug(
										`Epoch ${iTxEpoch}/${iTotalTxPerWallet} ${sAddress} => ${sSendToAddress} sTxHash ${sTxHash}`);
							}).catch((err) => {
								oLogger.error(`Epoch ${iTxEpoch}/${iTotalTxPerWallet} sAddress: ${sAddress} Err ${err.message}`);
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
		//
		else if (args.d) {
			try {
				await (async () => {
//					const oCliProgress = new CliProgress.Bar({
//						format: 'Delegating  [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total}'
//					}, CliProgress.Presets.shades_grey);
					let
							iStartTime            = process.hrtime()[0],
							iTxEpoch              = 0,
							iTxEpochMultiplicator = 5,
							iTxDone               = 0,
							iTotalTx              = arWalletInstances.length;

					oLogger.debug('Start Delegating Test ');

//					oCliProgress.start(iTotalTx, 0, {
//						fTxPerSec: 0
//					});

					while (arWalletInstances.length) {
						let arWalletsChunk = [];

						iTxEpoch++;

						for (let i = 0; i < iTxEpoch * iTxEpochMultiplicator; i++) {
							if (0 >= arWalletInstances.length) break;
							arWalletsChunk.push(arWalletInstances.pop());
						}

						try {
							oLogger.debug(`Start Delegating batch  #${iTxEpoch} | ${arWalletsChunk.length} Tx `);

							let arDfdSendChunk = arWalletsChunk.map(async (oWallet) => {
								let sAddress        = oWallet.getAddressString(),
								    fBalance        = await oApp.getBalance(sAddress),
								    fDelegateAmount = fTxAmount,
								    fBalanceRest    = fBalance.toFixed(5) - fDelegateFee;

								if (0 < fBalanceRest) {
									return await oApp.delegateTo(oWallet, fDelegateAmount);
								}

								return new Promise.reject(new Error(`Not enough tokens!`));
							});

							await Promise.all(arDfdSendChunk.map(fnReflect)).
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

