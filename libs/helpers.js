const { apiClient } = require('@liskhq/lisk-client');
const config = require('../config.json');
const network = config.blockchainApp.network;
const rpc = config.blockchainApp.rpc_endpoint;
const RPC_ENDPOINT = rpc.exist[rpc.active];
let clientCache;

//Get api url
function getAPI(url){
	return network.exist[network.active].serviceAPI+url;
}

//Get explorer url(mainnet/testnet)
function getExplorer(url){
	return network.exist[network.active].explorer+url;
}

//Convert lsk to beddows
function lskAsBeddows(num){
    return Number(num * Math.pow(10, 8));
}
//Convert beddows to lsk
function beddowsAsLsk(num){
    return (num * Math.pow(10, -8)).toLocaleString();
}

//Menu builder
function menuBuilder(urlParam){
  var menu = '';

  //Home
  if(urlParam === ''){
    menu += '<li class="active"><a href="/" title="Home">Home</a></li>';
  } else {
    menu += '<li><a href="/" title="Home">Home</a></li>';
  }

  //Pool statistics
  if(urlParam === '/pool-stats'){
    menu += '<li class="active"><a href="/pool-stats" title="Pool statistics">Pool statistics</a></li>';
  } else {
    menu += '<li><a href="/pool-stats" title="Pool statistics">Pool statistics</a></li>';
  }

  //Open statistic
  if(urlParam === '/voter-stats'){
    menu += '<li class="active"><a href="/voter-stats" title="Voter statistics">Voter statistics</a></li>';
  } else {
    menu += '<li><a href="/voter-stats" title="Voter statistics">Voter statistics</a></li>';
  }

  //Pool charts
  if(urlParam === '/charts'){
    menu += '<li class="active"><a href="/charts" title="Charts">Charts</a></li>';
  } else {
    menu += '<li><a href="/charts" title="Charts">Charts</a></li>';
  }

  return menu;
}

//Amount checker
function voteCheck(amount){
  const am = Number(amount);
  const maxVote = lskAsBeddows(config.pool.maxVote);
  const minVote = lskAsBeddows(config.pool.minVote);

  if(am > 0 && am >= minVote){
    if(am <= maxVote){
      return true;
    }
  }

  return false;
}

//Clear voteList
function clearVoteList(voteList){
    const clearVoteList = voteList.filter(x => {
      return x.address != config.delegate.address;
    });

    const mergedVote = clearVoteList.reduce((prev, cur) => {
      const index = prev.findIndex(v => v.address === cur.address);
      
      if(index === -1) {
        prev.push(cur);
      } else {
        prev[index].amount = (Number(prev[index].amount) + Number(cur.amount)).toString();
      }
      return prev;
    }, []); 

    return mergedVote;
}

//Log
function log(type, message){
  var d = new Date();
  var curr_date = ("0" + d.getDate()).slice(-2);
  var curr_month = ("0" + (d.getMonth() + 1)).slice(-2);
  var curr_year = d.getFullYear();
  var curr_hours = ("0" + d.getHours()).slice(-2);
  var curr_minutes = ("0" + d.getMinutes()).slice(-2);
  var curr_second = ("0" + d.getSeconds()).slice(-2);

  console.log("["+type+"] "+curr_date+"."+curr_month+"."+curr_year+" "+curr_hours+":"+curr_minutes+":"+curr_second+" |", message);
}

//Lisk client
const getClient = async () => {
  if (!clientCache) {
  	if(rpc == 0){ clientCache = await apiClient.createIPCClient(RPC_ENDPOINT)};
  	if(rpc == 1){ clientCache = await apiClient.createWSClient(RPC_ENDPOINT)};
  }
  return clientCache;
};

module.exports = { getClient, getAPI, getExplorer, lskAsBeddows, beddowsAsLsk, menuBuilder, voteCheck, clearVoteList, log};