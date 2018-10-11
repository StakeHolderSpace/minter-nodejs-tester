// for debuging add to console command before run app.js : set NODE_ENV=development

'use strict';
let
		minimist      = require('minimist'),
		args          = minimist(process.argv.slice(2), {
			string : [
				'debug', 'verbose'
			],
			alias  : {
				d: 'debug',
				v: 'verbose'
			},
			default: {
				debug  : false,
				verbose: false
			}
		}),
		oPath         = require('path'),
		oFs           = require('fs'),
		sUtilsRoot    = oPath.join(__dirname, './lib/utils/'),
		oConfig       = require(sUtilsRoot + 'nconf'),
		oUtils        = require(sUtilsRoot + 'utils'),
		oLogger       = require(sUtilsRoot + 'winston')(module),
		oMinterWallet = require('minterjs-wallet'),
		oMinterSdk    = require('minter-js-sdk');

// ==============================================================================

process.title = 'StakeHolder Overload Tester';
process.on('uncaughtException', function(err) {
	oLogger.error('Caught exception: ' + err, err.stack.split('\n'));
	return false;
});

oLogger.info('Started!');

const oApp = (function() {

	const arWalletInstances = [];
	const arMinterNodeList = Array.from(oConfig.get('minterNodeList'));
	const sDelegateToNodePubKey = oConfig.get('delegateToNodePubKey') ||
			'Mp8f053f3802d33f5e7092bb01ca99ae77606f4faf759c72560d5ee69b8e191a56';
	const sPathToWalletsFile = oConfig.get('pathToWalletsFile') || './config/wallets.json';
// TODO: Инстанцируем Корневой кошелек
	const oRootWallet = oMinterWallet.walletFromMnemonic(oConfig.get('rootWallet:sMnemonic') || '');

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
	 */
	App.prototype.getTestWallets = function(cb) {
		//  Проверяем наличие файла кошельков.
		//  Если нет, то генерим нужное кол-во и сохраняем данные в файл
		if (!oUtils.fileExists(sPathToWalletsFile)) {
			let iTotalWalletsCount = parseInt(oConfig.get('totalWalletsCount')) || 1;

			for (let i = 0; i <= iTotalWalletsCount; i++) {
				arWalletInstances.push(oMinterWallet.generateWallet());
			}

			let sJsonWallets = JSON.stringify(arWalletInstances.reduce((arResult, oWallet) => {
				if (oWallet instanceof oMinterWallet) {
					arResult.push({
						'sAddress' : oWallet.getAddressString(),
						'sMnemonic': oWallet.getMnemonic()
					});
				}

				return arResult;
			}, []));

			oFs.writeFile(sPathToWalletsFile, sJsonWallets, 'utf8', function(err, data) {
				cb(err, arWalletInstances);
			});
		}
		else {
			// Открываем файл кошельков и выбираем данные о кошельках
			oFs.readFile(sPathToWalletsFile, 'utf8', function(err, data) {

				if (err) {
					cb(err, arWalletInstances);
				}
				else {
					let arWallets = JSON.parse(data);

					arWallets.forEach((oWalletData) => {
						try {
							arWalletInstances.push(oMinterWallet.walletFromMnemonic(oWalletData.sMnemonic));
						}
						catch (e) {
							cb(err, arWalletInstances);
						}
					});

					cb(null, arWalletInstances);
				}
			});

		}
	};

	/**
	 *
	 */
	App.prototype.doTestDelegate = function(oWallet, cb) {
		// TODO: По каждому кошельку делаем тестовую транзакцию
		let
				sNodeUrl  = '',
				oPostTx   = null,
				oTxParams = null;

		if (
				(oWallet instanceof oMinterWallet) &&
				arMinterNodeList.length &&
				sDelegateToNodePubKey.length
		) {

			sNodeUrl = arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)];
			oPostTx = new oMinterSdk.PostTx({baseURL: sNodeUrl});
			oTxParams = new oMinterSdk.DelegateTxParams({
				privateKey   : oWallet.getPrivateKeyString(),
				publicKey    : sDelegateToNodePubKey,
				coinSymbol   : 'MNT',
				stake        : 10,
				feeCoinSymbol: 'MNT',
				message      : 'overload Tx'
			});

			// async
			oPostTx(oTxParams).then((response) => {
				let sTxHash = response.data.result.hash;
				oLogger.info(`Tx created: ${sTxHash}`);

			}).catch((err) => {

				let sErrorMessage = err.response.data.log;
				oLogger.error(` ${sErrorMessage}`);

			});

		} else {
			return cb(null, []);
		}

	};

	return new App;
}());

oApp.getTestWallets((err, arWalletInstances) => {
	let iTotalTxCount = parseInt(oConfig.get('totalTxCount')) || 10;

	// TODO: Переводим на каждый кошелек сумму для тестов

	//
	for (let i = 0; i <= iTotalTxCount; i++) {
		arWalletInstances.forEach((oWallet) => {
			oApp.doTestDelegate(oWallet, (err, data) => {
				if (err) {
					oLogger.error(err.message);
				} else {
					oLogger.info('?');
				}
			});
		});
	}

});

