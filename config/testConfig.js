const FlightSuretyApp = artifacts.require("FlightSuretyApp");
const FlightSuretyData = artifacts.require("FlightSuretyData");
const BigNumber = require('bignumber.js');

const Config = async function (accounts) {

    let nrOfAdmins = 3;
    let nrOfAirlines = 7;
    let nrOfOracles = 20;
    let nrOfUsers = 3;

    let accountIndex = 0;
    let sliceEnd;

    let owner = accounts[accountIndex++];

    let admins = [];
    sliceEnd = accountIndex + nrOfAdmins;
    for (; accountIndex <= sliceEnd; accountIndex++) {
        admins.push(accounts[accountIndex]);
    }

    let airlines = [];
    sliceEnd = accountIndex + nrOfAirlines
    for (; accountIndex <= sliceEnd; accountIndex++) {
        airlines.push({
            "name": "Airline" + accountIndex,
            "address": accounts[accountIndex]
        })
    }

    let oracles = [];
    sliceEnd = accountIndex + nrOfOracles
    for (; accountIndex <= sliceEnd; accountIndex++) {
        oracles.push(accounts[accountIndex]);
    }

    let users = [];
    sliceEnd = accountIndex + nrOfUsers
    for (; accountIndex <= sliceEnd; accountIndex++) {
        users.push(accounts[accountIndex]);
    }

    let flightSuretyData = await FlightSuretyData.new();
    let flightSuretyApp = await FlightSuretyApp.new(flightSuretyData.address, airlines[0].name, airlines[0].address);
    await flightSuretyData.authorizeContract(flightSuretyApp.address, {from: owner});

    return {
        owner: owner,
        weiMultiple: (new BigNumber(10)).pow(18),
        flightSuretyData: flightSuretyData,
        flightSuretyApp: flightSuretyApp,
        airlines: airlines,
        oracles: oracles,
        admins: admins,
        users: users
    }
};

module.exports = {
    Config: Config
};