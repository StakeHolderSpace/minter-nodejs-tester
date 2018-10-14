// for debuging add to console command before run app.js : set NODE_ENV=development

'use strict';
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

	const arWalletInstances = [];
	const arMinterNodeList = Array.from(oConfig.get('minterNodeList'));

	/**
	 *
	 * @constructor
	 */
	function App() {
		let self = this;

	}

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
	 * @param oWallet
	 * @param iDelegateAmount
	 * @param cb
	 * @returns {*}
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
				message      : 'test Tx'
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
	 * @param iFundAmount
	 * @param cb
	 * @returns {*}
	 */
	App.prototype.sendCoinTo = async function(oWalletFrom, sToAddress, iFundAmount) {

		let
				iAmount     = iFundAmount || 0.5,
				_sToAddress = sToAddress || oWalletFrom.getAddressString(),
				sNodeUrl    = arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)],
				oPostTx     = null,
				oTxParams   = null;

		if ((oWalletFrom instanceof oMinterWallet.default) && 0 < iAmount) {
			oPostTx = new oMinterSdk.PostTx({baseURL: sNodeUrl});
			oTxParams = new oMinterSdk.SendTxParams({
				privateKey   : oWalletFrom.getPrivateKeyString(),
				address      : _sToAddress,
				amount       : iAmount,
				coinSymbol   : 'MNT',
				feeCoinSymbol: 'MNT',
				message      : 'test Tx'
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
			throw new Error('Wrong wallet or iFundAmount=0');
		}

	};

	App.prototype.getBalance = async function(sAddress) {

	};

	App.prototype.init = async function() {
		return 'ready';
	};

	return App;

}());

const oApp = new App;

oApp.init().then(async () => {

// prepare Wallets
	let arWalletInstances = await oApp.loadWallets();

	if (!arWalletInstances.length) {
		let iTotalWalletsCount = parseInt(oConfig.get('totalWalletsCount')) || 10;

		arWalletInstances = await oApp.createWallets(iTotalWalletsCount);

		await  oApp.saveWallets();
	}

	if (arWalletInstances.length) {

		// Send
		(async () => {
			const
					fSendFee            = 0.1,
					iTotalTestDuration  = parseInt(oConfig.get('totalTestDuration')) || 1,//минуты
					iTotalWalletsCount  = parseInt(oConfig.get('totalWalletsCount')) || 10,
					iTxAmount           = 0.1,
					iTotalTxPerWallet   = Math.round(iTotalTestDuration * 60 / 5),
					fTotalFundPerWallet = (iTxAmount + fSendFee) * iTotalTxPerWallet,
					fTotalBudget        = fTotalFundPerWallet * iTotalWalletsCount;

			oLogger.debug('start ' + new Date());
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

			// Асинхронное пополнение
			const arFundedWallets = [];

			const SplitFundWallet = async (oWalletFrom, oWalletTo) => {
				// Получить бюджет кошелька
				let fBalance = await oApp.getBalance(oWalletFrom.getAddressString());
				let fFundAmount = (fBalance / 2) - fSendFee;
				// Отправить половину
				if (0 < fFundAmount) {
					return await oApp.sendCoinTo(oWalletFrom, oWalletTo.getAddressString(), fFundAmount);
				} else {
					throw new Error(
							`Not enougth tokens to send. Wal:${oWalletFrom.getAddressString()} balance:${fBalance} needle: ${fBalance +
							fSendFee}`);
				}
			};

			try {
				// Пополняем первый кошелек общим бюджетом
				let oWallet = arWalletInstances.pop();
				await oApp.sendCoinTo(oRootWallet, oWallet.getAddressString(), fTotalBudget);
				arFundedWallets.push(oWallet);

				while (arWalletInstances.length) {
					// Асинхронно Пополняем с каждого кошелька с монетами все остальные, делением пополам бюджета кошелька
					await Promise.all(arFundedWallets.map(async (oWalletFrom) => {

						let oWalletTo = arWalletInstances.pop();
						if (!oWalletTo) {
							return Promise.resolve();
						}

						return SplitFundWallet(oWalletFrom, oWalletTo).then((sTxHash) => {
							oLogger.debug(`Success funded wallet: ${oWalletTo.getAddressString()} sTxHash ${sTxHash}`);
						}).catch((err) => {
							oLogger.error(`Failed fund wallet: ${oWalletTo.getAddressString()} Err ${err.message}`);
						});

					}));
				}

				//Перекидываем кошельки в родной массив
				while (arFundedWallets.length) {
					arWalletInstances.push(arFundedWallets.pop());
				}

			}
			catch (err) {
				oLogger.error(err.message);
			}

			oLogger.debug('stop ' + new Date());

		})();

		/*
				// Delegate
				(async () => {
					const
							iTotalTxCount = parseInt(oConfig.get('totalTxCount')) || 10,
							iTxPerWallet  = Math.round(iTotalTxCount / parseInt(arWalletInstances.length)) || 1;

					let iDelegateAmount = 50;

					oLogger.debug('start ' + new Date());
					for (let iTxEpoch = 0; iTxEpoch < iTxPerWallet; iTxEpoch++) {
						await Promise.all(arWalletInstances.map(async (oWallet) => {
							let sAddress = oWallet.getAddressString();
							return oApp.delegateTo(oWallet, iDelegateAmount).then((sTxHash) => {
								oLogger.debug(`Epoch ${iTxEpoch}/${iTxPerWallet} sAddress: ${sAddress} sTxHash ${sTxHash}`);
							}).catch((err) => {
								oLogger.error(`Epoch ${iTxEpoch}/${iTxPerWallet} sAddress: ${sAddress} Err ${err.message}`);
							});
						}));
					}

					oLogger.debug('stop ' + new Date());

				})();
		*/
	}
})
;
