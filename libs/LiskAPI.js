//Load modules
const { apiClient } = require('@liskhq/lisk-client');
const got = require('got');

class LiskAPI{
  constructor(config){
    this.address = config.pool.delegateAddress;
    this.serviceAPI = config.blockchain.network.exist[config.blockchain.network.active].serviceAPI;
    this.pageLimit = 100;
  }

  //Get Delegate Info
  async getDelegateInfo(){
    let res = await got(this.serviceAPI+"accounts?address="+this.address).json();
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
  async getLastForgedBlock(){
    //Get last forged block
    let res = await got(this.serviceAPI+"accounts?address="+this.address).json();
    const block = res.data[0].dpos.delegate.lastForgedHeight;

    //Get block data
    res = await got(this.serviceAPI+"blocks?height="+block).json();
    const blockData = res.data[0];

    return blockData;
  }
  //Get Lisk client
  async getClient(){
    if (!this.clientCache) {
      switch(this.rpc.active){
        case 0: this.clientCache = await apiClient.createIPCClient("~/.lisk/lisk-core");
        case 1: this.clientCache = await apiClient.createWSClient("ws://localhost:8080/ws");
        default: this.clientCache = await apiClient.createIPCClient("~/.lisk/lisk-core");
      }
    }

    return this.clientCache;
  }
}

module.exports = LiskAPI;