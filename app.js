// for debuging add to console command before run app.js : set NODE_ENV=development
//"http://35.205.94.100:8841"
'use strict';
const axios = require('axios');

require = require('esm')(module);

const
    minimist   = require('minimist'),
    args       = minimist(process.argv.slice(2), {
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
    oPath      = require('path'),
    sLibRoot   = oPath.join(__dirname, './lib/'),
    sUtilsRoot = oPath.join(sLibRoot, '/utils/'),
    sTestsRoot = oPath.join(sLibRoot, '/tests/'),
    oConfig    = require(sUtilsRoot + 'nconf'),
    oUtils     = require(sUtilsRoot + 'utils'),
    oLogger    = require(sUtilsRoot + 'winston')(module),
    oMenu      = require(sUtilsRoot + 'menu');

require('dotenv').config();

//process.env.NODE_ENV = (oConfig.get('debug')) ? 'development' : 'production';

process.title = 'Minter Overload Tests';
process.on('uncaughtException', function(err) {
  oLogger.error('Caught exception: ' + err);
  console.log(err.stack.split('\n'));
  return false;
});

const oMinterHelper = require(sUtilsRoot + '/minter-helper');

oUtils.clear();

oUtils.showAppCliTitle();

// ==============================================================================

oMinterHelper.init()
    .then(async (arMinterNodeList) => {

      const iGasPriceRatio = parseInt(oConfig.get('iGasPriceRatio')) || 60;

      const
          fSendFee           = 0.1 * iGasPriceRatio,
          fDelegateFee       = 0.2 * iGasPriceRatio,
          fTxAmount          = 0.1,
          iTotalTestDuration = parseInt(oConfig.get('totalTestDuration')) || 60,// seconds
          iTotalTxPerWallet  = Math.round(iTotalTestDuration / 5),
          iTotalWalletsCount = parseInt(oConfig.get('totalWallets')) || 10;// workers

      while (true) {

        // prepare Wallets
        let arWalletInstances = await oMinterHelper.loadWallets(iTotalWalletsCount);

        if (!arWalletInstances.length) {
          arWalletInstances = await oMinterHelper.createWallets(iTotalWalletsCount);
          await oMinterHelper.saveWallets(arWalletInstances);
        } else if (arWalletInstances.length < iTotalWalletsCount) {
          let iDiff = iTotalWalletsCount - arWalletInstances.length;
          arWalletInstances = arWalletInstances.concat(await oMinterHelper.createWallets(iDiff));
          await oMinterHelper.saveWallets(arWalletInstances);
        }

        if (arWalletInstances.length) {

          let oAnswer = await oMenu.askTestType();
          oUtils.clear();

          switch (oAnswer.sTestType) {
              /*
              * Тест Опустошения кошельков.
              * Выводит деньги со всех кошельков на главный кошелек
              * Отправляет запросы пачками по наростающей 5,10,15,20...
              */
            case 'withdrawal':
              try {
                const WithdrawalTest = require(sTestsRoot + 'withdrawal');
                await WithdrawalTest.run(oMinterHelper, {
                  arWallets: arWalletInstances,
                  fSendFee : fSendFee
                });
              }
              catch (err) {
                oLogger.error(`Failed withdrawal: Err ${err.message}`);
                process.exit(1);
              }
              break;
              /*
              * Тест Пополнения кошельков
              * Генерит Чеки с главного кошелька, на сумму достаточную для теста Send, и обналичивает их.
              * Обналичивание производится по схеме : за раз параллельно 1/10 от общего кол-ва кошельков
              */
            case 'fund':
              try {
                const FundTest = require(sTestsRoot + 'fund_check');
                await FundTest.run(oMinterHelper, {
                      arWallets     : arWalletInstances,
                      fSendFee      : fSendFee,
                      fFundPerWallet: (fTxAmount + fDelegateFee) * iTotalTxPerWallet
                    }
                );
              }
              catch (err) {
                oLogger.error(`Failed Async Funding: ${err.message}`);
                process.exit(1);
              }
              break;
              /*
              * Тест Отправки монет
              * Отправляет переводы со ВСЕХ кошельков паралельно. Делает iTotalTxPerWallet итераций.
              */
            case 'send':
              try {
                const SendTest = require(sTestsRoot + 'send');
                await SendTest.run(oMinterHelper, {
                  arWallets        : arWalletInstances,
                  fSendFee         : fSendFee,
                  fSendAmount      : fTxAmount,
                  iTotalTxPerWallet: iTotalTxPerWallet
                });
              }
              catch (err) {
                oLogger.error(`Failed Send Test: ${err.message}`);
                process.exit(1);
              }
              break;
              /*
              * Тест Делегирования
              * Отправляет запросы пачками по наростающей 5,10,15,20...
              */
            case 'delegate':
              try {
                const DelegateTest = require(sTestsRoot + 'delegate');
                await DelegateTest.run(oMinterHelper, {
                  arWallets      : arWalletInstances,
                  fDelegateFee   : fDelegateFee,
                  fDelegateAmount: fTxAmount
                });
              }
              catch (err) {
                oLogger.error(`Failed Delegating Test: ${err.message}`);
                process.exit(1);
              }
              break;
              //
            case 'exit':
              process.exit(0);
              break;
              //
            default:
              break;
          }

          oLogger.info(`\n =========== Node Calls Stat ==========================`);
          let arStatCall = arMinterNodeList.sort(function(a, b) {
            return b.calls - a.calls;
          });

          arStatCall.forEach(function(oNodeClient) {
            oLogger.info(`${oNodeClient.sNodeUrl} - ${oNodeClient.calls} times`);
          });
          oLogger.info(`================================================= \n`);
        }
      }

    })
    .catch((err) => {
      oLogger.error(err.message);
    });

