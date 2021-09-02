const config = require('./config.json');

const pgp = require("pg-promise")();

const { validator, transactions, cryptography } = require('@liskhq/lisk-client');
const { getClient, lskAsBeddows } = require('./libs/helpers');
const { transactionSchema, transferAssetSchema } = require('./libs/schemas');
const db = pgp("postgres://"+config.db.dbuser+":"+config.db.dbpass+"@"+config.db.dbhost+":"+config.db.dbport+"/"+config.db.dbname);

const network = config.blockchainApp.network;
const { publicKey, address } = cryptography.getAddressAndPublicKeyFromPassphrase(config.pool.payouts.pay_passphrase1);
const minbal = lskAsBeddows(config.pool.withdrawal_min);

function Payout(){		
	//Select all voters
	db.any("SELECT * FROM voters WHERE active = 'true' AND CAST(balance as bigint) > "+minbal)
	.then(rdata => {
		//Check pool has voter for payouts
		if(rdata.length > 0){
			getClient().then(async client => {
				const account = await client.account.get(address);
      			let nonce = Number(account.sequence.nonce);

	      		for(var i = 0; i < rdata.length; i++){
	      			const recipientAddress = cryptography.getAddressFromBase32Address(rdata[i].address, 'lsk');
	  				const jsonTX = createTX({
						"amount": rdata[i].balance,
						"recipientAddress": recipientAddress,
						"senderPublicKey": publicKey,
						"passphrase1": config.pool.payouts.pay_passphrase1,
						"message": config.pool.payouts.pay_message,
						"nonce": nonce
					});

	  				//Send TX to node
	  				const sendTX = await client.transaction.send(jsonTX);

	  				//Check postin TX
					const newtworkTX = await client.transaction.getFromPool(sendTX.transactionId);
		  		
	  				if(newtworkTX.length){
  						//Update voter balance
						db.result(pgp.helpers.update({'balance': 0}, ['balance'], 'voters') + ' WHERE "id" = '+rdata[i].id)
						.then(rdata => {
							console.log("[INF] Payout time: Withdrawing pool balance to voter address. TXID: "+sendTX.transactionId);
						})
						.catch(error => {
							console.log("[ERR] "+error.message || error);
						});

						//Update withdrawal history
						db.result(pgp.helpers.insert(
							{
								"voter_id": rdata[i].id,
								"reward": rdata[i].balance,
								"fees": Number(jsonTX.fee),
								"txid": sendTX.transactionId,
								"timestamp": Date.now()
							},
							['voter_id', 'reward', 'fees', 'txid', 'timestamp'],
							'withdrawal_history'
						))
						.then(resd => {
							console.log("[INF] Payout time: Updating payout history.");
						})
						.catch(error => {
							console.log("ERR", error.message || error);
						});

						nonce++;
	  				} else {
	  					console.log("[ERR] Transaction("+sendTX.transactionId+") not sended");
	  				}
	  			}
			});
		} else {
			console.log("[INF] Payout time: No voter balances matching minimum withdrawal amount!");
		}
	})
	.catch(error => {
		console.log(error)
	});
}

function createTX(data){
	var network = config.blockchainApp.network;

	//Asset data
	var transferAsset = {
		amount: BigInt(data.amount),
		recipientAddress: Buffer.from(data.recipientAddress,'hex'),
		data: data.message
	};

	//TX data
	var unsignedTransaction = {
		moduleID: Number(2),
		assetID: Number(0),
		fee: BigInt(10000000),
		nonce: BigInt(data.nonce),
		senderPublicKey: Buffer.from(data.senderPublicKey,'hex'),
		asset: Buffer.alloc(0),
		signatures: [],
	};

	//Add asset to TX
	unsignedTransaction.asset = transferAsset;

	//Set TX fee
	var option = { numberOfSignatures: 1 };
	if(config.pool.payouts.pay_passphrase2){
		option = { numberOfSignatures: 2 };
	}
	unsignedTransaction.fee = transactions.computeMinFee(transferAssetSchema, unsignedTransaction, option);

	//Sign TX
	var signedTransaction = {};
	signedTransaction = transactions.signTransaction(
		transferAssetSchema,
		unsignedTransaction,
		Buffer.from(network.exist[network.active].networkID, 'hex'),
		config.pool.payouts.pay_passphrase1
	);

	if(config.pool.payouts.pay_passphrase2){
		var keys = {
			mandatoryKeys: [Buffer.from(publicKey[0],'hex'), Buffer.from(publicKey[1],'hex')],
		  	optionalKeys: [],
		  	numberOfSignatures: 2
		}

		signedTransaction = transactions.signMultiSignatureTransaction(
		  	transferAssetSchema,
		  	signedTransaction,
		  	Buffer.from(network.exist[network.active].networkID, 'hex'),
		  	config.pool.payouts.pay_passphrase2,
		  	keys
		);
	}

	return signedTransaction;
}

Payout();