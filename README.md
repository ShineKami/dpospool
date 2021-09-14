# DPoSPool
DPoS Delegate pool
<br>
Donnations: lskcuy6uvwgq2nqp858saa7tmbppy9c9dzunsxmvu

## Requirements

- Ubuntu(20.04), NodeJS(12.22), Git, Cron<br>
- npm/yarn, gulp, pm2<br>

## Configure<br>
All pool configuration in "config.json", edit "config.json" before "bash pool.sh install" and set "login, pass, network etc."<br>
After change "config.json" for the changes to take effect on work pool use "bash pool.sh reload"
config.json settings:
<pre>
"blockchain": {
	"nodeAPI": false, //Set true if you have local node, this get some data(not all for now) from local node without serviceAPI
	"network": {
		"active": 0, //Set 1 if you wont start pool on testnet

...

"pool": {
	"name": "Pool", //Name of pool, show on webpage
	"paytime": "24h", //Payout time, show on main page
	"delegateAddress": "", //You delegate address, for script this is MAIN OPTION
	"port": 3000, //Port where will be stat pool site
	"minVote": 10, //Minimal vote, if vote less then 'minVote' he will be exclude
	"maxVote": 1000000, //Maximal vote, if vote more then 'maxVote' he will be exclude
	"showmore": 10, //How many data show before add 'showmore' load button
	"poolfees": 30, //You reward from forging in percent, other will be distribute to voters
	"exclude_votes": [] //Exclude votes list, add to here you delegate address for self-exclude
},
"payouts": {
	"cron": "@daily", //The period with which 'cron' will be start 'payouts' script(if need set the cron pattern '0 */24 * * *'). For update cron job 'bash pool.sh updatecron' 
	"minpay": 2, //Minimal pool balance for payouts. 
	"passphrase1": "", //Payouts passphrase1. You can set payouts from any address
	"passphrase2": false, //Set passphrase2 if you payout address has 2 signatures
	"message": "", //Set you message for transactions  if needed. For example: "Payout from ShineKami" or "Thank's for voting for ShineKami"
	"poolfees":[{ //Set address(es) where you wont send you 'poolfees' reward, if not set all 'poolfees' will be on delegate address balance.  
		"address": "",
		"percent": 100 //You can distribute the output to different addresses, the percentage determines how much to send to which address.
	}]
}
</pre>

## Installation

<pre>
git clone git@github.com:ShineKami/dpospool.git
cd public_src
yarn install
gulp release
cd ..
yarn install
bash pool.sh install
</pre>

## Controll

<pre>
bash pool.sh start - start pool script
bash pool.sh stop - stop pool script
bash pool.sh payouts - pay pool reward to voters
bash pool.sh help - see all commands
</pre>