'use strict';
import MinterApi from 'minter-js-sdk/src/api/index';

const axios = require('axios');

require = require('esm')(module);

const
    oPath         = require('path'),
    oFs           = require('fs'),
    CliProgress   = require('cli-progress'),
    _Has          = require('lodash.has'),
    Promise       = require('bluebird'),
    oConfig       = require('./nconf'),
    oUtils        = require('./utils'),
    oLogger       = require('./winston')(module),
    oMinterWallet = require('minterjs-wallet'),
    oMinterSdk    = require('minter-js-sdk'),
    jsonRpc       = require('jsonrpc-lite');

const iGasPrice = 5;

const App = (function() {
  const PIP_DIVIDER = Math.pow(10, 18);
  const arMinterNodeList = [];
  let oHttpClient = null;

  /**
   *
   * @constructor
   */
  function App() {
    let self = this;

  }

  App.prototype._getNode = function() {

  };

  App.prototype._AxiosErrHandler = function(console) {
    // Error
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      // console.log(error.response.data);
      // console.log(error.response.status);
      // console.log(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error', error.message);
    }
    console.log(error.config);
  };

  /**
   *
   * @param arMinterNodeList
   * @returns {Promise<*>}
   */
  App.prototype._getNode = function() {

    let oNode = arMinterNodeList[Math.floor(Math.random() * arMinterNodeList.length)];
    oNode.calls++;

    return oNode;
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
    let sRootDir = process.cwd();
    let sDefaultWalletsPath = oPath.join(sRootDir, oConfig.get('pathToWalletsFile') || './config/wallets.json');
    const _sPathToWalletsFile = sPathToWalletsFile || sDefaultWalletsPath;
    const arWalletInstances = [];

    if (oUtils.fs.fileExists(_sPathToWalletsFile)) {
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
    let sRootDir = process.cwd();
    const sDefaultPath = oPath.join(sRootDir, oConfig.get('pathToAddressBook') || './config/addrbook.json');
    const _sPathToAddressBook = sPathToAddressBook || sDefaultPath;
    let arMinterNodeList = [];
    let arFallbackNodeList = Array.from(oConfig.get('fallbackNodeList'));

    let dfdNodeCheck = arFallbackNodeList.map(async (sAddress) => {
      return await oSelf.checkNode(sAddress)
          .then(async (code) => {
            return {
              sAddress: sAddress,
              iCode   : code
            };
          });
    });

    await Promise.all(dfdNodeCheck.map(oUtils.fnReflect))
        .then(results => {
          arMinterNodeList = arMinterNodeList.concat(
              results.reduce((arResult, oNodeCheckData) => {
                if (oNodeCheckData.resolved && 0 === parseInt(oNodeCheckData.payload.iCode)) {
                  arResult.push(oNodeCheckData.payload.sAddress);
                }
                return arResult;
              }, [])
          );
        })
        .catch(() => console.log('Fallback Node list check failed'));

    if (oUtils.fs.fileExists(_sPathToAddressBook)) {
      // Открываем файл кошельков и выбираем данные о кошельках
      let sJson = oFs.readFileSync(_sPathToAddressBook, 'utf8');

      if (sJson.length) {
        try {
          const oCliProgress = new CliProgress.Bar({
            format : 'Loading AddressBook [{bar}] {percentage}% | {value}/{total}',
            barsize: 65
          }, CliProgress.Presets.shades_grey);
          let arAddressBook = JSON.parse(sJson).addrs.map((oNodeData) => {
            return `http://${oNodeData.addr.ip}:8841`;
          });

          arAddressBook = [...new Set(arAddressBook)];

          oCliProgress.start(arAddressBook.length + arMinterNodeList.length, 0);

          let dfdNodeCheck = arAddressBook.map(async (sAddress) => {
            return await oSelf.checkNode(sAddress).then(async (code) => {
              return {
                sAddress: sAddress,
                iCode   : code
              };
            });
          });

          await Promise.all(dfdNodeCheck.map(oUtils.fnReflect)).then(results => {

            arMinterNodeList = arMinterNodeList.concat(results.reduce((arResult, oNodeCheckData) => {
              if (oNodeCheckData.resolved && 0 === parseInt(oNodeCheckData.payload.iCode)) {
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
    // Выборка уникальных адрессов. (в итоге кол-во в прогрессе может не совпадать с числом в Массиве)
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
   * @param sNodePubKey
   */
  App.prototype.delegateTo = async function(oWallet, iDelegateAmount, sNodePubKey) {
    let
        iAmount   = iDelegateAmount || 0.1,
        sNodeUrl  = '',
        oTxParams = null;

    const sDelegateToNodePubKey = sNodePubKey || oConfig.get('delegateToNodePubKey') ||
        'Mp8f053f3802d33f5e7092bb01ca99ae77606f4faf759c72560d5ee69b8e191a56';

    if ((oWallet instanceof oMinterWallet.default) && sDelegateToNodePubKey.length) {
      const oNode = this._getNode();
      const oMinterNode = oNode.minterNode;
      sNodeUrl = oNode.sNodeUrl;

      oTxParams = new oMinterSdk.DelegateTxParams({
        privateKey   : oWallet.getPrivateKeyString(),
        publicKey    : sDelegateToNodePubKey,
        coinSymbol   : 'MNT',
        stake        : iAmount,
        feeCoinSymbol: 'MNT',
        gasPrice     : iGasPrice,
        message      : ''
      });

      return oMinterNode.postTx(oTxParams)
          .then(async (response) => {

            return response;
          })
          .catch((err) => {
            let sErrorMessage = err.message;
            if (_Has(err, 'response.data')) {
              sErrorMessage += JSON.stringify(err.response.data);
            }

            throw new Error(sErrorMessage);
          });

    } else {
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
        sNodeUrl  = '',
        oTxParams = null;

    if ((oWalletFrom instanceof oMinterWallet.default) && 0 < _fAmount) {
      const oNode = this._getNode();
      const oMinterNode = oNode.minterNode;
      sNodeUrl = oNode.sNodeUrl;

      let _sToAddress = sToAddress || oWalletFrom.getAddressString();
      let sFromAddress = oWalletFrom.getAddressString();
      let oResult = {};

      oTxParams = new oMinterSdk.SendTxParams({
        privateKey   : oWalletFrom.getPrivateKeyString(),
        address      : _sToAddress,
        amount       : _fAmount,
        coinSymbol   : 'MNT',
        gasPrice     : iGasPrice,
        message      : ''
      });

      return oMinterNode.postTx(oTxParams)
          .then((response) => {

            let sTxHash = '';

            if (_Has(response, 'data.id')) {
              response.data.id = ('string' === typeof (response.data.id) && 0 >= response.data.id.length) ?
                  'null' :
                  response.data.id;

              let sTxHash      = '',
                  oResponse    = jsonRpc.parseObject(response.data),
                  sRespType    = oResponse.type,
                  oPayloadData = oResponse.payload;

              if ('success' !== sRespType) {
                oLogger.debug(`sendCoinTo oErr ${oResponse}`);
                let oErr = oResponse.error;
                throw oErr;
              }

              if (oPayloadData.result && oPayloadData.result.hasOwnProperty('hash')) {
                sTxHash = oPayloadData.result.hash;
              }
            } else if (('string' === typeof (response))) {
              sTxHash = response;
            } else {
              throw new Error('Unknown response ');
            }

            return {
              from  : sFromAddress,
              to    : _sToAddress,
              amount: _fAmount,
              txHash: sTxHash
            };

          })
          .catch((err) => {
            let sErrorMessage = `(${sNodeUrl}) ${err.message}`;

            if (_Has(err, 'response.data')) {
              sErrorMessage += JSON.stringify(err.response.data);
            }

            oResult = {
              from  : sFromAddress,
              to    : _sToAddress,
              amount: _fAmount,
              err   : sErrorMessage
            };

            throw new Error(JSON.stringify(oResult, undefined, 2));
          });
    } else {
      throw new Error(`Wrong WalletFrom or wrong amount (${_fAmount})`);
    }

  };

  /**
   *
   * @param oWallet
   * @param fAmount
   * @param sPassPhrase
   * @returns {Promise<string>}
   */
  App.prototype.issueCheck = async function(oWallet, fAmount, sPassPhrase) {
    let
        _fAmount     = parseFloat(fAmount) || 1,
        _sPassPhrase = sPassPhrase || 'password',
        sResult      = '';

    if ((oWallet instanceof oMinterWallet.default) && 0 < _fAmount) {
      sResult = oMinterSdk.issueCheck({
        privateKey: oWallet.getPrivateKeyString(),
        passPhrase: _sPassPhrase,
        nonce     : (new Date()).getTime(), // must be unique for private key
        coinSymbol: 'MNT',
        value     : _fAmount,
        dueBlock  : 999999 // at this block number check will be expired
      });

    } else {
      throw new Error(`Wrong WalletFrom or wrong amount (${_fAmount})`);
    }

    return sResult;
  };

  /**
   *
   * @param oWallet
   * @param sCheck
   * @param sPassPhrase
   * @returns {Promise<T>}
   */
  App.prototype.redeemCheck = async function(oWallet, sCheck, sPassPhrase) {
    let
        _sCheck      = sCheck || '',
        _sPassPhrase = sPassPhrase || 'password',
        oTxParams    = null,
        sNodeUrl     = '',
        oResult      = {};

    if ((oWallet instanceof oMinterWallet.default) && 0 < _sCheck.length) {

      const oNode = this._getNode();
      const oMinterNode = oNode.minterNode;
      sNodeUrl = oNode.sNodeUrl;

      oTxParams = new oMinterSdk.RedeemCheckTxParams({
        privateKey   : oWallet.getPrivateKeyString(),
        check        : _sCheck,
        password     : _sPassPhrase,
        feeCoinSymbol: 'MNT',
        gasPrice     : 1
      });

      return oMinterNode.postTx(oTxParams)
          .then((response) => {

            let sTxHash = '';

            if (_Has(response, 'data.id')) {
              response.data.id = ('string' === typeof (response.data.id) && 0 >= response.data.id.length) ?
                  'null' :
                  response.data.id;

              let
                  oResponse    = jsonRpc.parseObject(response.data),
                  sRespType    = oResponse.type,
                  oPayloadData = oResponse.payload;

              if ('success' !== sRespType) {
                oLogger.debug(`redeemCheck oErr ${oResponse}`);

                throw new Error(oResponse.error);
              }

              if (oPayloadData.result && oPayloadData.result.hasOwnProperty('hash')) {
                sTxHash = oPayloadData.result.hash;
              }
            } else if (('string' === typeof (response))) {
              sTxHash = response;
            } else {
              throw new Error('Unknown response ');
            }

            return sTxHash;
          }).catch((err) => {
            let sErrorMessage = `(${sNodeUrl}) ${err.message}`;

            if (_Has(err, 'response.data')) {
              sErrorMessage += JSON.stringify(err.response.data);
            }

            throw new Error(sErrorMessage);
          });
    } else {
      throw new Error(`Wrong WalletFrom or wrong Check length (${_sCheck.length})`);
    }
  };

  /**
   *
   * @param sAddress
   * @returns {Promise<number>}
   */
  App.prototype.getBalance = async function(sAddress) {
    return oHttpClient.get(`/address?address="${sAddress}"`).then((response) => {
      response.data.id = ('string' === typeof (response.data.id) && 0 >= response.data.id.length) ?
          'null' :
          response.data.id;

      let oBalance     = {},
          fBalanceMnt  = 0,
          oResponse    = jsonRpc.parseObject(response.data),
          sRespType    = oResponse.type,
          oPayloadData = oResponse.payload;

      if ('success' !== sRespType) {
        oLogger.debug(`getBalance oErr ${oResponse}`);
        let oErr = oResponse.error;
        throw oErr;
      }

      if (oPayloadData.result && oPayloadData.result.hasOwnProperty('balance')) {
        oBalance = oPayloadData.result.balance;
        fBalanceMnt = Number(oBalance.MNT) / PIP_DIVIDER;
      }

      oLogger.debug(`sAddress ${sAddress} balance MNT ${fBalanceMnt}`);

      return fBalanceMnt;
    });
  };

  /**
   *
   * @param sNodeUrl
   * @returns {Promise<*|PromiseLike<T | never>|Promise<T | never>>}
   */
  App.prototype.checkNode = async function(sNodeUrl) {
    let oHttpClient = axios.create({
      baseURL: sNodeUrl,
      timeout: 2500
    });

    return oHttpClient.get('/status').then((response) => {
      response.data.id = ('string' === typeof (response.data.id) && 0 >= response.data.id.length) ?
          'null' :
          response.data.id;

      let
          oResponse    = jsonRpc.parseObject(response.data),
          sRespType    = oResponse.type,
          oPayloadData = oResponse.payload;

      if ('success' !== sRespType) {
        oLogger.debug(`checkNode oErr ${oResponse}`);
        let oErr = oResponse.error;
        throw oErr;
      }

      if (oPayloadData.result && !oPayloadData.result.tm_status.sync_info.catching_up) {
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
    // prepare NodeList
    let arNodeList = await oApp.loadAddressBook();

    arNodeList.forEach(function(sNodeUrl, index) {
      arMinterNodeList.push({
        id        : index,
        sNodeUrl  : sNodeUrl,
        minterNode: new oMinterSdk.Minter({apiType: 'node', baseURL: sNodeUrl, timeout: 8000}),
        calls     : 0
      });
    });

    oHttpClient = axios.create({
      baseURL: arMinterNodeList[0].sNodeUrl,
      timeout: 2500
    });

    return Promise.resolve(arMinterNodeList);
  };

  return App;

}());

const oApp = new App;

module.exports = oApp;