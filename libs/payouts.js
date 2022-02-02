//Load config
const config = require('../config.json');

//Load modules
const pgp = require("pg-promise")();
const { lskAsBeddows, beddowsAsLsk, log } = require('./helpers');
const LiskAPI = require('./LiskAPI');

//Vars
const api = new LiskAPI(config);
const minbal = lskAsBeddows(config.payouts.minpay);
let data = [];

//Init db
const db = pgp("postgres://"+config.db.dbuser+":"+config.db.dbpass+"@"+config.db.dbhost+":"+config.db.dbport+"/"+config.db.dbname);

//Payout
function Payout(){
	let pData = [];

	//Create and send TX
	db.any("SELECT * FROM voters WHERE balance>"+minbal)
	.then(rdata1 => {
		db.any("SELECT * FROM poolfees WHERE balance>0")
		.then(rdata2 => {
			//Merge payouts data
			data = rdata1.concat(rdata2);
			
			log("INF", "-= We have "+data.length+" address for payout =-");

			if(data.length){
				api.getNonce()
				.then(res => {
					let nonce = res;

					for(let i = 0; i<data.length; i++){
						const jsonTX = api.createTX({
							"recipientAddress": data[i].address,
							"amount": data[i].balance,
							"nonce": nonce
						});

						//Send transaction to node and buld payouts list
						api.sendTX(jsonTX)
						.then(res => {
							pData.push({
								"id": data[i].id,
								"reward": data[i].balance,
								"recipient": data[i].address,
								"txid": res.transactionId,
								"fees": Number(jsonTX.fee),
								"time": Date.now(),
								"vote": data[i].vote
							});
						})
						.catch(error => {
							log("ERR", error)
						});

						nonce++;
					}
				})
				.catch(error => {
					log("ERR", error);
				});

				log("INF", "All payouts sended.");
				log("INF", "Start checking txid in blockchain ~110 sec...");
			} else {
				log("INF", "Payout time: No one balances matching minimum payout amount!");
			}
		})
	})

	//Check tx in blockchain after 10/11 blocks
	setTimeout(() => {
		for(let i=0; i<pData.length; i++){
			api.checkTX(pData[i].txid)
			.then(answ => {
				if(pData[i].vote){
					//Reset balance
					db.result(pgp.helpers.update({'balance': 0}, ['balance'], 'voters') + ' WHERE id='+pData[i].id)
					.then(() => {
						log("INF", "Voters payouts("+beddowsAsLsk(pData[i].reward)+" LSK) - Recipient: "+pData[i].recipient+" - TXID: "+pData[i].txid);
					})
					.catch(error => {
						log("ERR", error.message || error);
					});

					//Update payout history
					db.result(pgp.helpers.insert({
						"voter_id": pData[i].id,
						"reward": pData[i].reward,
						"fees": pData[i].fees,
						"txid": pData[i].txid,
						"timestamp": pData[i].time
					}, ['voter_id', 'reward', 'fees', 'txid', 'timestamp'], 'withdrawal_history'))
					.catch(error => {
						log("ERR", error.message || error);
					});
				} else {
					//Reset balance
					db.result(pgp.helpers.update({'balance': 0}, ['balance'], 'poolfees') + ' WHERE id='+pData[i].id)
					.then(() => {
						log("INF", "Poolfees payoyts("+beddowsAsLsk(pData[i].reward)+" LSK) - Recipient: "+pData[i].recipient+" - TXID: "+pData[i].txid);
					})
					.catch(error => {
						log("ERR", error.message || error);
					});
				}
				payoutCount++;
			})
			.catch(error => {
				log("ERR", error.message+" | Reward: "+beddowsAsLsk(pData[i].reward)+" LSK - Recipient: "+pData[i].recipient+" - Transaction: "+pData[i].txid);
			});
		}
	}, 110000);
}

if(config.payouts.passphrase1){
	Payout();	
} else {
	log("ERR", "Payout passphrase not set in config");
}