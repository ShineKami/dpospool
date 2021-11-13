const config = require('../config.json');
const network = config.blockchain.network;

//Get explorer url(mainnet/testnet)
function getExplorer(url){
	return network.exist[network.active].explorer+url;
}

//Convert lsk to beddows
function lskAsBeddows(num){
		return Number(num * Math.pow(10, 8));
}
//Convert beddows to lsk
function beddowsAsLsk(num, flag){
	if(!flag){
		return (num * Math.pow(10, -8)).toLocaleString();
	} else {
		return Number(num * Math.pow(10, -8));    
	}
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

//Time out format
function timeFormat(time){
	let d = new Date(+time);
			d = ("0" + d.getDate()).slice(-2)+"."+("0" + (d.getMonth() + 1)).slice(-2)+"."+d.getFullYear()+" | "+("0" + d.getHours()).slice(-2)+":"+("0" + d.getMinutes()).slice(-2)+":"+("0" + d.getSeconds()).slice(-2);
	return d;
}

//Calculate local vote weight
function getLocalVoteWeight(voteList){
	let localVoteWeight = 0;

	for(let i=0; i<voteList.length; i++){
		if(voteCheck(voteList[i])){
			localVoteWeight+=Number(voteList[i].amount);
		}
	}

	return localVoteWeight;
}

//Clear voteList
function clearVoteList(voteList){
    const mergedVote = voteList.reduce((prev, cur) => {
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

//Vote checker
function voteCheck(vote){
	const am = Number(vote.amount);
	const maxVote = lskAsBeddows(config.pool.maxVote);
	const minVote = lskAsBeddows(config.pool.minVote);
	const excludeList = config.pool.exclude_votes;
	const find = excludeList.filter(x => x === vote.address);

	if(!find.length){
		if(am > 0 && am >= minVote){
			if(am <= maxVote){
				return true;
			}
		}
	}

	return false;
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

module.exports = { getExplorer, lskAsBeddows, beddowsAsLsk, menuBuilder, voteCheck, getLocalVoteWeight, timeFormat, clearVoteList, log };