'use strict';
const argv = require('minimist')(process.argv.slice(2));
const inquirer = require('inquirer');

const askTestType = () => {
	const questions = [
		{
			type   : 'list',
			name   : 'sTestType',
			message: 'Which type test need to do:',
			choices: [
				{
					name : 'Withdrawal all tokens to Root wallet (batch "5,10,15...")',
					value: 'withdrawal'
				}, {
					name : 'Fund tokens to test wallets from Root (batch "1/10 wallets")',
					value: 'fund'
				}, {
					name : 'Send tokens to Root wallet (batch "All wallets N times")',
					value: 'send'
				}, {
					name : 'Delegate tokens (batch "5,10,15...")',
					value: 'delegate'
				}
			],
			default: 'withdrawal'
		}
	];

	return inquirer.prompt(questions);
};

module.exports = {
	askTestType: askTestType
};