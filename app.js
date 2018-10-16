// for debuging add to console command before run app.js : set NODE_ENV=development

'use strict';
const axios = require('axios');

require = require('esm')(module);

const
		minimist      = require('minimist'),
		args          = minimist(process.argv.slice(2), {
			boolean: [
				'fund', 'delegate'
			],
			alias  : {
				f: 'fund',
				d: 'delegate'
			},
			default: {
				fund    : false,
				delegate: false
			}
		}),
		oPath         = require('path'),
		oFs           = require('fs'),
		CliProgress   = require('cli-progress'),
		_Has          = require('lodash.has'),
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
	const arWalletInstances = [];
	const arMinterNodeList = Array.from(oConfig.get('minterNodeList'));
	const oHttpClient = axios.create({baseURL: arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)]});

	/**
	 *
	 * @constructor
	 */
	function App() {
		let self = this;

	}

	/**
	 *
	 * @param iTotalWalletsCount
	 * @returns {Promise<Array>}
	 */
	App.prototype.createWallets = async function(iTotalWalletsCount) {
		let _iTotalWalletsCount = parseInt(iTotalWalletsCount) || 1;
		const oCliProgress = new CliProgress.Bar({
			format: 'Creating wallets [{bar}] {percentage}% | {value}/{total}'
		}, CliProgress.Presets.shades_classic);

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
	 * @param sPathToWalletsFile
	 * @returns {Promise<undefined>}
	 */
	App.prototype.saveWallets = async function(sPathToWalletsFile) {
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
	 * @returns {Promise<Array>}
	 */
	App.prototype.loadWallets = async function(sPathToWalletsFile) {
		let sDefaultWalletsPath = oPath.join(__dirname, oConfig.get('pathToWalletsFile') || './config/wallets.json');
		const _sPathToWalletsFile = sPathToWalletsFile || sDefaultWalletsPath;

		if (oUtils.fileExists(_sPathToWalletsFile)) {
			// Открываем файл кошельков и выбираем данные о кошельках
			let sJson = oFs.readFileSync(_sPathToWalletsFile, 'utf8');

			if (sJson.length) {
				try {
					let arWallets = JSON.parse(sJson);
					const oCliProgress = new CliProgress.Bar({
						format: 'Loading wallets [{bar}] {percentage}% | {value}/{total}'
					}, CliProgress.Presets.shades_classic);

					oCliProgress.start(arWallets.length, 0);

					arWallets.forEach((oWalletData) => {
						try {
							arWalletInstances.push(oMinterWallet.walletFromMnemonic(oWalletData.sMnemonic));
							oCliProgress.update(arWalletInstances.length);
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
	 * @returns {Array}
	 */
	App.prototype.getWallets = function() {
		return arWalletInstances;
	};

	/**
	 *
	 * @param oWallet
	 * @param iDelegateAmount
	 */
	App.prototype.delegateTo = async function(oWallet, iDelegateAmount) {
		let
				iAmount   = iDelegateAmount || 0.1,
				sNodeUrl  = arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)],
				oPostTx   = null,
				oTxParams = null;

		if ((oWallet instanceof oMinterWallet.default) && sDelegateToNodePubKey.length) {
			oPostTx = new oMinterSdk.PostTx({baseURL: sNodeUrl});
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
	 * @param fFundAmount
	 * @returns {Promise<T>}
	 */
	App.prototype.sendCoinTo = async function(oWalletFrom, sToAddress, fFundAmount) {
		let
				fAmount     = parseFloat(fFundAmount) || 0.5,
				_sToAddress = sToAddress || oWalletFrom.getAddressString(),
				sNodeUrl    = arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)],
				oPostTx     = null,
				oTxParams   = null;

		if ((oWalletFrom instanceof oMinterWallet.default) && 0 < fAmount) {
			oPostTx = new oMinterSdk.PostTx({baseURL: sNodeUrl});
			oTxParams = new oMinterSdk.SendTxParams({
				privateKey   : oWalletFrom.getPrivateKeyString(),
				address      : _sToAddress,
				amount       : fAmount,
				coinSymbol   : 'MNT',
				feeCoinSymbol: 'MNT',
				message      : ''
			});

			return oPostTx(oTxParams).then((response) => {
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
			throw new Error('Wrong wallet or fFundAmount=0');
		}

	};

	/**
	 *
	 * @param sAddress
	 * @returns {Promise<number>}
	 */
	App.prototype.getBalance = async function(sAddress) {

		return oHttpClient.get(`/api/balance/${sAddress}`).
				then((response) => {
					let fBalance = Number(response.data.result.balance.MNT) / iPipDivider;
					//oLogger.debug(`sAddress ${sAddress} balance ${fBalance}`);
					return fBalance;
				});
	};

	/**
	 *
	 * @returns {Promise<string>}
	 */
	App.prototype.init = async function() {
		return 'ready';
	};

	return App;

}());

const oApp = new App;

oApp.init().then(async () => {

	const
			fSendFee            = 0.02,
			fDelegateFee        = 0.1,
			fTxAmount           = 0.2,
			iTotalTestDuration  = parseInt(oConfig.get('totalTestDuration')) || 60,// seconds
			iTotalTxPerWallet   = Math.round(iTotalTestDuration / 5),
			fTotalFundPerWallet = (fTxAmount + fDelegateFee) * iTotalTxPerWallet,

			iTotalWalletsCount  = parseInt(oConfig.get('totalSimultaneousTx')) || 10;// workers

// prepare Wallets
	let arWalletInstances = await oApp.loadWallets();

	// Создаем и сейвим кошельки если их нет
	if (!arWalletInstances.length) {
		arWalletInstances = await oApp.createWallets(iTotalWalletsCount);
		await  oApp.saveWallets();
	}

	if (arWalletInstances.length) {

		// Fund
		await (async () => {

			oLogger.debug('start Funding ');
			/* Синхронное пополнение
						for (const oWallet of arWalletInstances) {
							let sAddress = oWallet.getAddressString();

							await oApp.sendCoinTo(oRootWallet, sAddress, fTotalFundPerWallet).then((sTxHash) => {
								oLogger.debug(`Success sent ${fTotalFundPerWallet} to sAddress: ${sAddress} sTxHash ${sTxHash}`);
							}).catch((err) => {
								oLogger.error(`Failed to send ${fTotalFundPerWallet} to sAddress: ${sAddress}  Err ${err.message}`);
							});
						}
			*/

			// Асинхронное пополнение Разбиением на 2
			arWalletInstances = await (async () => {
				const oCliProgress = new CliProgress.Bar({
					format: 'Funding wallets [{bar}] {percentage}% | {value}/{total}'
				}, CliProgress.Presets.shades_classic);
				let arFundedWallets = [];
				oCliProgress.start(arWalletInstances.length, 0);

				try {
					while (arWalletInstances.length) {
						let
								iNearest2Ratio    = Math.floor(Math.log(arWalletInstances.length) / Math.log(2)),
								iAlgoChunkWallets = Math.pow(2, iNearest2Ratio),
								arChunkWallets    = []; // Подмножество Кошельков на пополнение

						// Выбираем подмношество кошельков пригодное для алгоритма (кол-во важно)
						for (let i = 0; i < iAlgoChunkWallets; i++) {
							arChunkWallets.push(arWalletInstances.pop());
						}

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
							const
									fQueueBudget       = (fTotalFundPerWallet + fSendFee * iNearest2Ratio) * arQueueWallets.length,
									arTmpFundedWallets = []; // Пополненые Кошельки из подмножества

							/**
							 * Функция  Делит баланс кошелька на 2-х поровну.
							 * @param oWalletFrom
							 * @param oWalletTo
							 * @returns {Promise<*>}
							 * @constructor
							 */
							const SplitBalance = async (oWalletFrom, oWalletTo) => {
								// Получить бюджет кошелька
								let
										fBalance     = await oApp.getBalance(oWalletFrom.getAddressString()),
										fFundAmount  = (fBalance - fSendFee) / 2,
										sAddressTo   = oWalletTo.getAddressString(),
										sAddressFrom = oWalletFrom.getAddressString();

								// Отправить 0.5 от баланса
								if (0 < fFundAmount && fTotalFundPerWallet <= fFundAmount) {
									return await oApp.sendCoinTo(oWalletFrom, sAddressTo, fFundAmount).then((sTxHash) => {
										return {
											'code'       : 0,
											'sTxHash'    : sTxHash,
											'fFundAmount': fFundAmount
										};
									});
								}
								else {
									return {
										'code': 1,
										'err' : new Error(
												`Not enough tokens to send. Wal:${sAddressFrom} balance:${fBalance} needle: ${fFundAmount}`)
									};
								}

							};

							// Пополняем первый кошелек общим бюджетом
							let oWallet = arQueueWallets.shift();
							await oApp.sendCoinTo(oRootWallet, oWallet.getAddressString(), fQueueBudget).then((sTxHash) => {
								oLogger.debug(`Success funded from RootWallet: ${oWallet.getAddressString()} sTxHash ${sTxHash}`);
							});
							arTmpFundedWallets.push(oWallet);

							// Асинхронно Пополняем с каждого кошелька с монетами все остальные, делением пополам баланса кошелька
							while (arQueueWallets.length) {
								await Promise.all(arTmpFundedWallets.map(async (oWalletFrom) => {
									let oWalletTo = arQueueWallets.pop();
									if (!oWalletTo) {
										return Promise.resolve();
									}

									let sWalletToAddress = oWalletTo.getAddressString();
									let sWalletFromAddress = oWalletFrom.getAddressString();

									return SplitBalance(oWalletFrom, oWalletTo).then((oTxData) => {
										if (0 === oTxData.code) {
											arTmpFundedWallets.push(oWalletTo);
											oLogger.debug(
													`Success: ${sWalletFromAddress} => ${sWalletToAddress} ( ${oTxData.fFundAmount}) sTxHash ${oTxData.sTxHash}`);
										} else {
											arQueueWallets.push(oWalletTo);
											oLogger.error(
													`Failed: ${sWalletFromAddress} => ${sWalletToAddress} ( ${oTxData.fFundAmount}) Err: ${oTxData.err}`);
										}
									}).catch((err) => {
										oLogger.error(
												`SplitBalance Failed: ${sWalletFromAddress} => ${sWalletToAddress} err ${err.message}`);
									});

								}));
							}

							return arTmpFundedWallets;
						};

						arFundedWallets = arFundedWallets.concat(await FundBySplitAlgo(arChunkWallets));

						oCliProgress.update(arFundedWallets.length);
					}
				}
				catch (err) {
					oLogger.error(`Got error in Async Funding: ${err.message}`);
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

		// Delegate
		await (async () => {
			const oCliProgress = new CliProgress.Bar({
				format: 'Sending Tx block [{bar}] {percentage}% | {value}/{total}'
			}, CliProgress.Presets.shades_classic);
			let fDelegateAmount = fTxAmount;

			oLogger.debug('start Delegating ');

			oCliProgress.start(iTotalTxPerWallet, 0);
			for (let iTxEpoch = 1; iTxEpoch <= iTotalTxPerWallet; iTxEpoch++) {
				await Promise.all(arWalletInstances.map(async (oWallet) => {
					let sAddress = oWallet.getAddressString();

					return oApp.delegateTo(oWallet, fDelegateAmount).then((sTxHash) => {
						oLogger.debug(`Epoch ${iTxEpoch}/${iTotalTxPerWallet} sAddress: ${sAddress} sTxHash ${sTxHash}`);
					}).catch((err) => {
						oLogger.error(`Epoch ${iTxEpoch}/${iTotalTxPerWallet} sAddress: ${sAddress} Err ${err.message}`);
					});
				}));
				oCliProgress.update(iTxEpoch);
			}
			oCliProgress.stop();
			oLogger.debug('end Delegating ');

		})();

	}
});

