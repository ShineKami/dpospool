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
    this.rpc_endpoint = "~/.lisk/lisk-core";

    //Payouts
    this.passphrase1 = config.payouts.passphrase1;
    this.passphrase2 = config.payouts.passphrase2;
    this.message = config.payouts.message;
    this.pfList = config.payouts.poolfees;
  }

  //Lisk client
  async getClient(){
    if (!this.clientCache) {
      this.clientCache = await apiClient.createIPCClient(this.rpc_endpoint);
    }

    return this.clientCache;
  }

  //Get Delegate Info
  async getAccInfo(){
    let data;

    if(!this.nodeAPI){
      const res = await got(this.serviceAPI+"accounts?address="+this.address).json();

      data = {
        "username": res.data[0].dpos.delegate.username,
        "balance": res.data[0].token.balance,
        "rank": res.data[0].dpos.delegate.rank,
        "selfVote": res.data[0].dpos.sentVotes[0].amount,
        "totalVote": res.data[0].dpos.delegate.totalVotesReceived,
        "lastForgedHeight": res.data[0].dpos.delegate.lastForgedHeight
      }
    } else {
      const address = cryptography.getAddressFromBase32Address(this.address, 'lsk').toString('hex');
      const apiClient = await this.getClient();
      const res = await apiClient.account.get(address);
      const decodeAcc = await apiClient.account.toJSON(res);
      const rank = await this.getDelegateRank();

      data = {
        "username": decodeAcc.dpos.delegate.username,
        "balance": decodeAcc.token.balance,
        "rank": rank,
        "selfVote": decodeAcc.dpos.sentVotes[0].amount,
        "totalVote": decodeAcc.dpos.delegate.totalVotesReceived,
        "lastForgedHeight": decodeAcc.dpos.delegate.lastForgedHeight
      }
    }

    return data;
  }
  //Get Delegate Votes
  async getVotesList(){
    if(!this.nodeAPI){
      let offcet = this.pageLimit;
      let res = await got(this.serviceAPI+"votes_received?address="+this.address+"&aggregate=true&limit="+this.pageLimit).json();
      let pages = Math.ceil(res.data.account.votesReceived/this.pageLimit);
      let voteList = res.data.votes;

      if(pages>1){
        let mergeResult = [];
        for(let i=2; i<=pages; i++){
          res = await got(this.serviceAPI+"votes_received?address="+this.address+"&aggregate=true&limit="+this.pageLimit+"&offset="+offcet).json();
          voteList.push.apply(voteList, res.data.votes);
          offcet +=this.pageLimit;
        }
      }

      return voteList;
    } else {
      const apiClient = await this.getClient();
      const res = await apiClient.invoke('forger:getVoters');

      return res[0].voters;
    }
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
  //Calculate delegate rank
  async getDelegateRank(){
    const address = (cryptography.getAddressFromBase32Address(this.address, "lsk")).toString("hex");
    const apiClient = await this.getClient();
    const allDelegates = await apiClient.invoke('app:getForgers', {});
  
    //Get all delegate addresses
    let delegateAddress = [];
    for(let i=0; i<allDelegates.length; i++){
      delegateAddress.push(allDelegates[i].address);
    }

    //Get delegate accounts
    const encodeDelegateAccs = await apiClient.invoke('app:getAccounts', { address: delegateAddress });

    //Top of all delegates
    let decodeDelegateAccs;
    let delegateTop = [];
    for(let i=0; i<encodeDelegateAccs.length; i++){
      decodeDelegateAccs = await apiClient.account.decode(encodeDelegateAccs[i]);
      delegateTop.push({
        "address": (decodeDelegateAccs.address).toString('hex'),
        "votesResived":decodeDelegateAccs.dpos.delegate.totalVotesReceived
      });
    }

    //Sorted
    const sortedTop = delegateTop.sort((a, b) => Number(b.votesResived) - Number(a.votesResived));
    const rank = sortedTop.findIndex( x => x.address === address);
    
    return rank;
  }
  
  //Create transaction
  createTX(data){ 
    //Transaction data
    const publicKey1 = cryptography.getAddressAndPublicKeyFromPassphrase(this.passphrase1).publicKey;
    let publicKey2 = "";
    if(this.passphrase2){
      publicKey2 = cryptography.getAddressAndPublicKeyFromPassphrase(this.passphrase2).publicKey;
    }
    const nonce = BigInt(data.nonce);
    const networkID = Buffer.from(this.network.exist[this.network.active].networkID, 'hex');

    //Asset data
    const recipientAddress = Buffer.from(cryptography.getAddressFromBase32Address(data.recipientAddress, 'lsk'), 'hex');
    const amount = BigInt(data.amount);
    //If this poolfees address remove transaction message
    let message = this.message;
    let find = this.pfList.filter(x => x.address === data.recipientAddress);
    if(find.length){
      message = "";
    }

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
}

module.exports = LiskAPI;