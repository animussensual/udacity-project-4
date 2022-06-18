import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';
import bodyParser from 'body-parser'


let config = Config['localhost'];

let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);

const STATUS_CODE_ON_UNKNOWN = 0;
const STATUS_CODE_ON_TIME = 10;
const STATUS_CODE_ON_LATE_AIRLINE = 20;
const STATUS_CODE_ON_LATE_WEATHER = 30;
const STATUS_CODE_ON_LATE_TECHNICAL = 40;
const STATUS_CODE_ON_LATE_OTHER = 50;

let accounts;
let owner;
let oracles = [];

//Register oracles
web3.eth.getAccounts((error, accts) => {
    owner = accts[0];
    accounts = accts;
}).then(async () => {
    let fee = web3.utils.toWei("1", "ether")
    for (let i = 0; i < 30; i++) {
        await flightSuretyApp.methods.registerOracle().send({from: accounts[i], value: fee, gas: '10000000'})
        let ids = await flightSuretyApp.methods.getOracle(accounts[i]).call({gas: '1000000'});
        oracles.push({
            "address": accounts[i],
            "ids": ids
        });
        console.log("Registered oracle", accounts[i])
    }
});

//submit oracles responses
flightSuretyApp.events.OracleRequest()
    .on('data', async (event) => {
        let index = event.returnValues.index;
        let flight = event.returnValues.flight;
        let timestamp = event.returnValues.timestamp;

        console.log("Requested flight status", index, flight, timestamp, new Date())

        let matches = oracles.filter(o => o.ids.includes(index));

        let status = Math.floor(Math.random() * 6) * 10;

        console.log("Sending status", status)

        await flightSuretyApp.methods.submitOracleResponse(index, flight, timestamp, status)
            .send({from: matches[0].address, gas: '1000000'})

        await flightSuretyApp.methods.submitOracleResponse(index, flight, timestamp, status)
            .send({from: matches[1].address, gas: '1000000'})


        let gotStatus = await flightSuretyApp.methods.viewFlightStatus(flight, timestamp).call();
        console.log("Got status", gotStatus)

    }).on("error", console.log)

flightSuretyApp.events.InsuranceCredited()
    .on('data', async (event) => {
       console.log("InsuranceCredited", event)

    })

const app = express();
app.use(bodyParser.json())

export default app;


