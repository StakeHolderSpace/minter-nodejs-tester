class MinterClient {

	BIP_DIVIDER = Math.pow(10, 18);

	/**
	 *
	 */
	constructor(sNodeUrl) {

		this.sNodeUrl = sNodeUrl || '';
	}

	async getBalance(sAddress) {
	}

	async getNonce(sAddress) {
	}

	async send(sTx) {
	}

}

export default MinterClient;