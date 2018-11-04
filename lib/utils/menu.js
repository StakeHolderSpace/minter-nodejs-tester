'use strict';
const argv = require('minimist')(process.argv.slice(2));
const inquirer = require('inquirer');

const askTestType = () => {
	const questions = [
		{
			type   : 'list',
			name   : 'sTestType',
			message: 'Which type test need to do:',
			choices: ['withdrawal', 'fund', 'send', 'delegate'],
			default: 'withdrawal'
		}
	];

	return inquirer.prompt(questions);
};


module.exports = {
	askTestType: askTestType
};