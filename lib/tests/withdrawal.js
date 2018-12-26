'use strict';
require = require('esm')(module);

const
    oPath       = require('path'),
    sUtilsRoot  = oPath.join(__dirname, '../utils/'),
    Promise     = require('bluebird'),
    CliProgress = require('cli-progress'),
    oConfig     = require(sUtilsRoot + 'nconf'),
    oUtils      = require(sUtilsRoot + 'utils'),
    oLogger     = require(sUtilsRoot + 'winston')(module);

const ENV = process.env.NODE_ENV;

let
    oMinterHelper = null,
    arWallets     = [],
    fSendFee      = 0.02,
    bIsDebugMode  = ENV === 'development';

const Withdrawal = async (arWallets) => {
  oLogger.debug('Start Withdrawal Test ');
  const oCliProgress = new CliProgress.Bar({
    format: 'Withdrawal [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total} | Round {iRound}' +
    ' (S:{iBatchSuccess}/T:{iBatchTotal})'
  }, CliProgress.Presets.shades_grey);
  const sSendToAddress = oConfig.get('sendToAddress') || 'Mx825088777c1f3f1c313ef5e247e187c0f696c439';

  let
      iStartTime      = process.hrtime()[0],
      iTxEpoch        = 0,
      iTotalTx        = arWallets.length,
      iBatchSuccess   = 0,
      iBatchTotal     = 0,
      iSuccessTxCount = 0;

  if (!bIsDebugMode) {
    oCliProgress.start(iTotalTx, 0, {
      fTxPerSec    : 0,
      iRound       : iTxEpoch,
      iBatchTotal  : iBatchTotal,
      iBatchSuccess: iBatchSuccess
    });
  }

  while (arWallets.length) {
    let arWalletsChunk = [];

    iTxEpoch++;

    for (let i = 0; i < iTxEpoch * 5; i++) {
      if (0 >= arWallets.length) break;
      arWalletsChunk.push(arWallets.pop());
    }

    try {
      oLogger.debug(`Start Withdrawal batch  #${iTxEpoch} | ${arWalletsChunk.length} Tx `);

      let arDfdSendChunk = arWalletsChunk.map(async (oWallet) => {
        let sAddress          = oWallet.getAddressString(),
            fBalance          = await oMinterHelper.getBalance(sAddress),
            fWithdrawalAmount = fBalance.toFixed(5) - fSendFee;

        if (fSendFee < fWithdrawalAmount) {
          return await oMinterHelper.sendCoinTo(oWallet, sSendToAddress, fWithdrawalAmount);
        }

        return new Promise.reject(`Not need Withdrawal, wallet empty!`);
      });

      await Promise.all(arDfdSendChunk.map(oUtils.fnReflect)).then(results => {
        //let arResolved = results.filter(result => result.resolved);
        let
            iBatchTotal   = results.length,
            arRejected    = results.filter(result => !result.resolved),
            iBatchSuccess = iBatchTotal - arRejected.length;

        iSuccessTxCount += iBatchSuccess;

        oLogger.debug(arRejected, ` Ok: (${iBatchSuccess} of ${iBatchTotal})`);

        if (!bIsDebugMode) {
          let iEpochTime = process.hrtime()[0];

          oCliProgress.update(iSuccessTxCount, {
            fTxPerSec    : Number(iSuccessTxCount / (iEpochTime - iStartTime)).toFixed(5),
            iRound       : iTxEpoch,
            iBatchTotal  : iBatchTotal,
            iBatchSuccess: iBatchSuccess
          });
        }
      }).catch(() => oLogger.debug('Withdrawal batch failed'));

      oLogger.debug(`End Withdrawal batch  #${iTxEpoch}`);
    }
    catch (err) {
      oLogger.error(
          `Failed withdrawal batch: Err ${err.message}`);
    }

  }

  if (!bIsDebugMode) {
    oCliProgress.stop();
  }

  oLogger.debug('End Withdrawal Test ');
};

const Exec = async (_oMinterHelper, oParams) => {
  oMinterHelper = _oMinterHelper || null;

  arWallets = oParams.arWallets || [];

  if (null !== oMinterHelper) {
    return await Withdrawal(arWallets);
  }

  return Promise.resolve();
};

module.exports = {
  run: Exec
};
