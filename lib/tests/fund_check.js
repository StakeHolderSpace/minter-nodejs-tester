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

const ENV = process.env.NODE_ENV;
const TIME_TO_CHECK_TX = process.env.TIME_TO_CHECK || 8;

let
    oMinterHelper  = null,
    arWallets      = [],
    arCheckBook    = [],
    fSendFee       = 0.02,
    fFundPerWallet = 10,
    bIsDebugMode   = ENV === 'development';

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

  return await Promise.all(arDfdTxChunk.map(oUtils.fnReflect)).then(results => {
    let arResolved = results.filter(result => result.resolved);

    return arResolved.map((result) => {
      return result.payload;
    });
  }).catch(() => console.log('IssueChecks batch failed'));

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
    format : 'Funding wallets [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}| Round {iRound} (S:{iBatchSuccess}/T:{iBatchTotal})',
    barsize: 65
  }, CliProgress.Presets.shades_grey);

  let
      arFundedWallets = [],
      iTxEpoch        = 0,
      iBatchSuccess   = 0,
      iBatchTotal     = 0,
      iChunkSize      = 80 /*> arWallets.length ? arWallets.length : Math.round(arWallets.length / 80)*/;

  if (!bIsDebugMode) {
    oCliProgress.start(arWallets.length, 0, {
      iRound       : iTxEpoch,
      iBatchTotal  : iBatchTotal,
      iBatchSuccess: iBatchSuccess
    });
  }
  // Разбиваем очередь кошельков на блоки с количеством пригодным для алгоритма. И пополняем.
  while (arWallets.length) {
    let arChunkChecks = []; // Подмножество Кошельков на пополнение

    iBatchTotal = 0;
    iBatchSuccess = 0;

    iTxEpoch++;

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
      return oMinterHelper.redeemCheck(oCheck.oWallet, oCheck.sCheck)
          .then(sTxHash => {
            oCheck.sTxHash = sTxHash;
            return oCheck;
          });
    });

    arFundedWallets = arFundedWallets.concat(
        await Promise.all(arDfdRedeemChunk.map(oUtils.fnReflect))
            .then(results => {
              let
                  arResolved = results.filter(result => result.resolved);

              iBatchTotal = results.length;
              iBatchSuccess = arResolved.length;

              if (bIsDebugMode) {
                let
                    iBatchTotal   = results.length,
                    arRejected    = results.filter(result => !result.resolved),
                    iBatchSuccess = iBatchTotal - arRejected.length;

                oLogger.debug(` Ok: (${iBatchSuccess} of ${iBatchTotal})`);
                if (arRejected.length) {
                  oLogger.debug({arRejected: arRejected});
                }

              }

              return arResolved.map((result) => {
                return result.payload;
              });
            })
            .catch((err) => {
              oLogger.error('RedeemCheck batch failed');
              return [];
            })
    );

    if (!bIsDebugMode) {
      oCliProgress.update(arFundedWallets.length, {
        iRound       : iTxEpoch,
        iBatchTotal  : iBatchTotal,
        iBatchSuccess: iBatchSuccess
      });
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

    return FundWallets(arWallets, arCheckBook);
  }

  return Promise.resolve();
};

module.exports = {
  run: Exec
};