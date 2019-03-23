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
const TIME_TO_CHECK_TX = process.env.TIME_TO_CHECK_TX || 8;


let
    oMinterHelper     = null,
    arWallets         = [],
    iTotalTxPerWallet = 1,
    fSendAmount       = 0.1,
    fSendFee          = 0.02,
    bIsDebugMode      = ENV === 'development';

/**
 *
 * @param fSendAmount
 * @param iTotalTxPerWallet
 * @returns {Promise<void>}
 * @constructor
 */
const Send = async (fSendAmount, iTotalTxPerWallet) => {
  oLogger.debug('start Sending Test ');

  const oCliProgress = new CliProgress.Bar({
    format: 'Sending [{bar}] {percentage}% | {fTxPerSec} tx/sec | ETA: {eta}s | {value}/{total} | Round {iRound}' +
        ' (S:{iBatchSuccess}/T:{iBatchTotal})'
  }, CliProgress.Presets.shades_grey);
  const sSendToAddress = oConfig.get('sendToAddress') || 'Mx825088777c1f3f1c313ef5e247e187c0f696c439';
  let
      iSuccessTxCount = 0,
      iBatchSuccess   = 0,
      iBatchTotal     = 0;

  if (!bIsDebugMode) {
    oCliProgress.start(iTotalTxPerWallet, 0, {
      fTxPerSec    : 0,
      iRound       : 0,
      iBatchTotal  : iBatchTotal,
      iBatchSuccess: iBatchSuccess
    });
  }

  let iStartTime = process.hrtime()[0];

  for (let iTxEpoch = 1; iTxEpoch <= iTotalTxPerWallet; iTxEpoch++) {

    let arDfdSendChunk = arWallets.map(async (oWallet) => {
      let sAddress = oWallet.getAddressString();

      return oMinterHelper.sendCoinTo(oWallet, sSendToAddress, fSendAmount).catch((err) => {
        throw new Error(`Epoch ${iTxEpoch}/${iTotalTxPerWallet} sAddress: ${sAddress} Err ${err.message}`);
      });
    });

    await Promise.all(arDfdSendChunk.map(oUtils.fnReflect))
        .then(results => {
          let
              iBatchTotal   = results.length,
              arRejected    = results.filter(result => !result.resolved),
              iBatchSuccess = iBatchTotal - arRejected.length;

          iSuccessTxCount += iBatchSuccess;

          oLogger.debug(` Ok: (${iBatchSuccess} of ${iBatchTotal})`);
          if (arRejected.length) {
            oLogger.debug({arRejected: arRejected});
          }

          if (!bIsDebugMode) {
            let iEpochTime = process.hrtime()[0];

            oCliProgress.update(iTxEpoch, {
              fTxPerSec    : Number(iSuccessTxCount / (iEpochTime - iStartTime)).toFixed(5),
              iRound       : 0,
              iBatchTotal  : iBatchTotal,
              iBatchSuccess: iBatchSuccess
            });
          }

        })
        .then(oResult => {
          return oUtils.wait(TIME_TO_CHECK_TX * 1000).then(() => oResult);
        })
        .catch((err) => oLogger.error('Sending batch failed'));

  }

  if (!bIsDebugMode) {
    oCliProgress.stop();
  }

  oLogger.debug('end Sending Test ');
};

/**
 *
 * @param _oMinterHelper
 * @param oParams
 * @returns {Promise<void>}
 * @constructor
 */
const Exec = async (_oMinterHelper, oParams) => {
  oMinterHelper = _oMinterHelper || null;

  arWallets = oParams.arWallets || [];
  fSendFee = oParams.fSendFee || 0.01;
  fSendAmount = oParams.fSendAmount || 0.1;
  iTotalTxPerWallet = oParams.iTotalTxPerWallet || 1;

  if (null !== oMinterHelper) {

    return Send(fSendAmount, iTotalTxPerWallet);
  }

  return Promise.resolve();
};

module.exports = {
  run: Exec
};