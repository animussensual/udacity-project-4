import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';

export default class Contract {
    constructor(network, callback) {

        let config = Config[network];
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.url));
        this.flightSuretyApp = new this.web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
        this.initialize(callback);
        this.owner = null;
        this.airlines = [];
        this.passengers = [];
    }

    initialize(callback) {
        this.web3.eth.getAccounts(async (error, accts) => {

            this.owner = accts[0];

            let ownerIsRegistered = await this.flightSuretyApp.methods.isAirlineAddressRegistered(this.owner).call();
            if (!ownerIsRegistered) {
                console.log("Owner is not registered", this.owner)
                return;
            }

            let names = ["British Airways", "Eastern Airways", "Virgin Atlantic"]
            this.airlines = [];
            accts.slice(1, 4).forEach((acc, index) => {
                this.airlines.push({
                    "name": names[index],
                    "address": acc,
                    "flights": []
                })
            })
            this.passengers = accts.slice(4, 8)

            let funding = this.web3.utils.toWei("10", "ether")
            this.airlines.forEach(async (al, index) => {
                await this.registerAirline(al)
                await this.fundAirline(al, funding)
                await this.registerFlight(al, "LFT" + index)
            })

            callback();
        });
    }


    isOperational(callback) {
        let self = this;
        self.flightSuretyApp.methods
            .isOperational()
            .call({from: self.owner}, callback);
    }

    fetchFlightStatus(flight, callback) {
        let self = this;
        let payload = {
            airline: self.airlines[0],
            flight: flight,
            timestamp: Math.floor(Date.now() / 1000)
        }
        self.flightSuretyApp.methods
            .fetchFlightStatus(payload.flight, payload.timestamp)
            .send({from: self.owner}, (error, result) => {
                callback(error, payload);
            });
    }

    async registerAirline(airline) {
        let self = this;

        console.log("Registering airline:", airline.name)
        await self.flightSuretyApp.methods.registerAirline(airline.name, airline.address)
            .send({from: self.owner, gas: '10000000'}, async (error, result) => {
                if (error) {
                    console.log(`Airline ${airline.name} registration failed`, error)
                    let is = await self.flightSuretyApp.methods.isAirlineAddressRegistered(airline.address).call();
                    console.log(`${self.owner} is registered ${is}`)

                } else {
                    console.log(`Airline ${airline.name} registration succeeded`, result)
                    let is = await self.flightSuretyApp.methods.isAirlineAddressRegistered(airline.address).call();
                    console.log(`${airline.name} is registered ${is}`)
                }
            });
    }

    async fundAirline(airline, amount) {
        let self = this;

        console.log("Funding airline:", airline)


        await self.flightSuretyApp.methods.fundAirline()
            .send({from: airline.address, gas: '10000000', value: amount}, async (error, result) => {
                if (error) {
                    console.log(`Airline ${airline.name} funding failed`, error)
                } else {
                    console.log(await self.flightSuretyApp.methods.getAirlineFunding(airline.name).call());
                    console.log(`Airline ${airline.name} funding succeeded`, result)
                }

            });
    }

    async registerFlight(airline, flight) {
        let self = this;
        let timestamp = Math.floor(Date.now() / 1000)
        airline.flights.push(flight)

        console.log("Registering flight:", airline, flight, timestamp)

        await self.flightSuretyApp.methods.registerFlight(airline.name, flight, timestamp)
            .send({from: airline.address, gas: '10000000'}, async (error, result) => {
                if (error) {
                    console.log(`Flight ${airline.name} ${flight} registration failed`, error)
                } else {
                    let is = await self.flightSuretyApp.methods.isFlightRegistered(flight).call();
                    console.log("Flight registered", flight, is)
                    console.log(`Flight ${airline.name} ${flight} registration succeeded`, result)
                }
            });
    }

    async buyInsurance(user, airline, flight, amount) {
        let self = this;

        console.log("Buying insurance", user, airline, flight, amount)
        self.flightSuretyApp.methods.buyInsuranceForFlight(airline, flight)
            .send({from: user, value: amount, gas: '10000000'}, (error, result) => {
                if (error) {
                    console.log(`Buying insurance failed`, error)
                } else {
                    console.log(`Buying insurance succeeded`, result)
                }
            });
    }

    async claimInsurance(user, flight) {
        let self = this;

        console.log("Claiming insurance", user, flight)
        console.log("User balance before", await self.web3.eth.getBalance(user))

        self.flightSuretyApp.methods.claimInsurance(flight)
            .send({from: user}, async (error, result) => {
                if (error) {
                    console.log(`Claiming insurance failed`, error)
                } else {
                    console.log(`Claiming insurance succeeded`, result)
                    console.log("User balance after", await self.web3.eth.getBalance(user))
                }
            });

    }

}