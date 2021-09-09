//Load modules
const { apiClient, validator, transactions, cryptography, codec } = require('@liskhq/lisk-client');
const { transactionSchema, transferAssetSchema } = require('./schemas');
const got = require('got');
const mycodec = new codec.Codec();

class LiskAPI {
  //Constructor
  constructor(config){
    this.address = config.pool.delegateAddress;
    this.network = config.blockchain.network;
    this.serviceAPI = this.network.exist[this.network.active].serviceAPI;
    this.pageLimit = 100;
    this.nodeAPI = config.blockchain.nodeAPI;

    //Payouts
    this.passphrase1 = config.payouts.passphrase1;
    this.passphrase2 = config.payouts.passphrase2;
    this.message = config.payouts.message;
  }

  //### Service API ####//
  //Get Delegate Info
  async getAccInfo(){
    const res = await got(this.serviceAPI+"accounts?address="+this.address).json();
    return res.data[0];
  }
  //Get Delegate Votes
  async getVotesList(aggregate = true){
    let res;
    let offcet = this.pageLimit;
    if(aggregate){
      res = await got(this.serviceAPI+"votes_received?address="+this.address+"&aggregate=true&limit="+this.pageLimit).json();  
    } else {
      res = await got(this.serviceAPI+"votes_received?address="+this.address+"&limit="+this.pageLimit).json();  
    }
    let pages = Math.ceil(res.data.account.votesReceived/this.pageLimit);
    let voteList = res.data.votes;

    if(pages>1){
      let mergeResult = [];
      for(let i=2; i<pages; i++){
        if(aggregate){
          res = await got(this.serviceAPI+"votes_received?address="+this.address+"&aggregate=true&limit="+this.pageLimit+"&offset="+offcet).json();
        } else {
          res = await got(this.serviceAPI+"votes_received?address="+this.address+"&limit="+this.pageLimit+"&offset="+offcet).json();
        }
        voteList.push.apply(voteList, res.data.votes);
        offcet +=this.pageLimit;
      }
    }

    return voteList;
  }
  //Get Last Forged Height
  async getLastForgedHeight(){
    if(!this.nodeAPI){
      //Get last forged block
      let res = await got(this.serviceAPI+"accounts?address="+this.address).json();
      const height = res.data[0].dpos.delegate.lastForgedHeight;

      //Get block data
      res = await got(this.serviceAPI+"blocks?height="+height).json();
      const blockData = res.data[0];

      return blockData;
    } else {
      const client = await this.getClient();
      const res = await client.account.get(cryptography.getAddressFromBase32Address(this.address, 'lsk'));
      const json = await client.account.toJSON(res);
      const height = json.dpos.delegate.lastForgedHeight;
      const block = await client.block.getByHeight(height);
      const jsonBlock = await client.block.toJSON(block);

      return jsonBlock.header;
    }
  }
  //Post transaction in network
  async sendTX(txData){
    if(!this.nodeAPI){
      const encodedTX = this.encodeTransaction(txData);
      const { body } = await got.post(this.serviceAPI+"transactions", { json: { transaction: encodedTX.toString('hex') }, responseType: 'json' });

      return body;
    } else {
      const client = await this.getClient();
      const body = await client.transaction.send(txData);

      return body;
    }
  }
  //Get Nonce
  async getNonce(){
    if(!this.nodeAPI){
      const payAddress = cryptography.getBase32AddressFromPassphrase(this.passphrase1, 'lsk');
      const res = await got(this.serviceAPI+"accounts?address="+payAddress).json();

      return Number(res.data[0].sequence.nonce);
    } else {
      const client = await this.getClient();
      const payAddress = cryptography.getAddressAndPublicKeyFromPassphrase(this.passphrase1).address;
      const res = await client.account.get(payAddress);

      return Number(res.sequence.nonce);
    }
  }
  
  //Create transaction
  createTX(data){ 
    //Transaction data
    const publicKey1 = cryptography.getAddressAndPublicKeyFromPassphrase(this.passphrase1).publicKey;
    if(this.passphrase2){
      const publicKey2 = cryptography.getAddressAndPublicKeyFromPassphrase(this.passphrase2).publicKey;
    }
    const nonce = BigInt(data.nonce);
    const networkID = Buffer.from(this.network.exist[this.network.active].networkID, 'hex');
    //Asset data
    const recipientAddress = Buffer.from(cryptography.getAddressFromBase32Address(data.recipientAddress, 'lsk'), 'hex');
    const amount = BigInt(data.amount);
    const message = this.message;

    //unsigTX
    let unsignedTX = {
      moduleID: Number(2),
      assetID: Number(0),
      fee: BigInt(10000000),
      nonce: nonce,
      senderPublicKey: publicKey1,
      asset: {
        amount: amount,
        recipientAddress: recipientAddress,
        data: message
      },
      signatures: [],
    };

    //Calculate minimal fee and add to tx data
    let option = { numberOfSignatures: 1 };
    if(this.passphrase2){
      option = { numberOfSignatures: 2 };
    }
    unsignedTX.fee = transactions.computeMinFee(transferAssetSchema, unsignedTX, option);

    //Sign TX
    let signedTransaction;
    signedTransaction = transactions.signTransaction(
      transferAssetSchema,
      unsignedTX,
      networkID,
      this.passphrase1
    );

    //If set passphrase2 use multisignature
    if(this.passphrase2){
      const keys = {
        mandatoryKeys: [ publicKey1, publicKey2 ],
        optionalKeys: [],
        numberOfSignatures: 2
      }

      signedTransaction = transactions.signMultiSignatureTransaction(
        transferAssetSchema,
        signedTransaction,
        networkID,
        this.passphrase2,
        keys
      );
    }

    return signedTransaction;
  }
  //Encode transaction(get from codec.js in lisk-api-client)
  encodeTransaction(transaction){
    const encodedAsset = mycodec.encode(transferAssetSchema, transaction.asset);
    const decodedTransaction = mycodec.encode(transactionSchema, {
        ...transaction,
        asset: encodedAsset,
    });

    return decodedTransaction;
  }

  //Client
  async getClient(){
    if (!this.clientCache) {
      this.clientCache = await apiClient.createIPCClient("~/.lisk/lisk-core");
    }

    return this.clientCache;
  }
}

module.exports = LiskAPI;