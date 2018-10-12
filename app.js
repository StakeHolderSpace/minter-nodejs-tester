// for debuging add to console command before run app.js : set NODE_ENV=development

'use strict';
require = require('esm')(module);

let
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
		_Has          = require('lodash.has'),
		sUtilsRoot    = oPath.join(__dirname, './lib/utils/'),
		oConfig       = require(sUtilsRoot + 'nconf'),
		oUtils        = require(sUtilsRoot + 'utils'),
		oLogger       = require(sUtilsRoot + 'winston')(module),
		oMinterWallet = require('minterjs-wallet'),
		oMinterSdk    = require('minter-js-sdk');

process.env.NODE_ENV = (oConfig.get('verbose')) ? 'development' : '';
process.title = 'StakeHolder Overload Tester';
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
const oApp = new (function() {

	const arWalletInstances = [];
	const arMinterNodeList = Array.from(oConfig.get('minterNodeList'));
	const sPathToWalletsFile = oConfig.get('pathToWalletsFile') || './config/wallets.json';

	/**
	 *
	 * @constructor
	 */
	function App() {
		let self = this;

	}

	/**
	 *
	 * @param cb
	 * @returns {*}
	 */
	App.prototype.getWallets = function() {
		//  Проверяем наличие файла кошельков.
		//  Если нет, то генерим нужное кол-во и сохраняем данные в файл
		let
				sFullPathToWalletsFile = oPath.join(__dirname, sPathToWalletsFile),
				iTotalWalletsCount     = parseInt(oConfig.get('totalWalletsCount')) || 1;

		if (arWalletInstances.length === iTotalWalletsCount) {
			return arWalletInstances;
		}
		else {
			let iDiffCount = 0;

			if (oUtils.fileExists(sFullPathToWalletsFile)) {
				// Открываем файл кошельков и выбираем данные о кошельках
				let sJson = oFs.readFileSync(sFullPathToWalletsFile, 'utf8');

				if (sJson.length) {
					try {
						let arWallets = JSON.parse(sJson);

						iDiffCount = iTotalWalletsCount - arWallets.length;

						arWallets.forEach((oWalletData) => {
							if (0 >= iDiffCount) {
								return;
							}

							try {
								arWalletInstances.push(oMinterWallet.walletFromMnemonic(oWalletData.sMnemonic));
								iDiffCount--;
							}
							catch (err) {
								oLogger.error(err.message);
							}

						});
					}
					catch (err) {
						oLogger.error(err.message);
					}
				}
			}

			iDiffCount = iTotalWalletsCount - arWalletInstances.length;

			for (let i = 0; i < iDiffCount; i++) {
				arWalletInstances.push(oMinterWallet.generateWallet());
			}
		}

		return arWalletInstances;
	};

	/**
	 *
	 * @param cb
	 * @returns {undefined}
	 */
	App.prototype.saveWallets = async function() {
		return new Promise((resolve, reject) => {
			let
					sJsonWallets           = '',
					sFullPathToWalletsFile = oPath.join(__dirname, sPathToWalletsFile);

			sJsonWallets = JSON.stringify(arWalletInstances.reduce((arResult, oWallet) => {
				if (oWallet instanceof oMinterWallet.default) {
					arResult.push({
						'sAddress' : oWallet.getAddressString(),
						'sMnemonic': oWallet.getMnemonic()
					});
				}
				return arResult;
			}, []));

			oFs.writeFile(sFullPathToWalletsFile, sJsonWallets, 'utf8', (err) => {
				return (!err) ? resolve() : reject(err);
			});
		});
	};

	/**
	 *
	 * @param oWallet
	 * @param iDelegateAmount
	 * @param cb
	 * @returns {*}
	 */
	App.prototype.delegateTo = async function(oWallet, iDelegateAmount) {
		return new Promise((resolve, reject) => {
			let
					iAmount   = iDelegateAmount || 0.5,
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

				return oPostTx(oTxParams).then((response) => {
					let sTxHash = response.data.result.hash;
					return resolve(sTxHash);
				}).catch((err) => {
					let sErrorMessage = err.message;
					if (_Has(err, 'response.data.log')) {
						sErrorMessage += '\n ' + err.response.data.log;
					}

					return reject(new Error(sErrorMessage));
				});

			}
			else {
				return reject(new Error('Wrong wallet or empty node PubKey'));
			}

		});
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
		return new Promise((resolve, reject) => {
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
					let sTxHash = response.data.result.hash;
					return resolve(sTxHash);

				}).catch((err) => {
					let sErrorMessage = err.message;
					if (_Has(err, 'response.data.log')) {
						sErrorMessage += '\n ' + err.response.data.log;
					}

					return reject(new Error(sErrorMessage));
				});

			}
			else {
				return reject(new Error('Wrong wallet or iFundAmount=0'));
			}
		});
	};

	return App;
}());

// prepare Wallets
let arWalletInstances = oApp.getWallets();

let dfdSave = oApp.saveWallets();


if (args.delegate) {

	dfdSave.then(() => {
		return new Promise((resolve, reject) => {
			let
					iTotalTxCount = parseInt(oConfig.get('totalTxCount')) || 10,
					iTxPerWallet  = Math.round(iTotalTxCount / parseInt(arWalletInstances.length)) || 1;

			//
			arWalletInstances.forEach((oWallet) => {
				let iDelegateAmount = 0.1;
				oApp.sendCoinTo(oRootWallet,oWallet.getAddressString(), iDelegateAmount).catch(err => {
					oLogger.error(err.message);
				});
			});

		});
	});


//
//// Delegate
//	dfdSave.then(() => {
//		return new Promise((resolve, reject) => {
//			let
//					iTotalTxCount = parseInt(oConfig.get('totalTxCount')) || 10,
//					iTxPerWallet  = Math.round(iTotalTxCount / parseInt(arWalletInstances.length)) || 1;
//
//			//
//			arWalletInstances.forEach((oWallet) => {
//				let iDelegateAmount = 0.1;
//				oApp.delegateTo(oWallet, iDelegateAmount).catch(err => {
//					oLogger.error(err.message);
//				});
//			});
//		});
//	});

}






