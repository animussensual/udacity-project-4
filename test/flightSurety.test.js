var Test = require('../config/testConfig.js');
const truffleAssert = require('truffle-assertions');
const BigNumber = require("bignumber.js");

//Here tests are interdependent, contract state is shared between all tests
contract('FlightSuretyApp', async (accounts) => {

    const STATUS_CODE_ON_TIME = 10;

    let config;
    before('setup contract', async () => {
        config = await Test.Config(accounts);
    });

    describe("Oracles", async () => {
        it('can register oracles', async () => {
            let fee = await config.flightSuretyApp.REGISTRATION_FEE.call();

            for (let a = 0; a < config.oracles.length; a++) {
                await config.flightSuretyApp.registerOracle({from: config.oracles[a], value: fee});
            }
            //Successfully registered oracles
        })

        it('can request flight status', async () => {
            let flight = 'Flight';
            let timestamp = Math.floor(Date.now() / 1000);

            // Submit a request for oracles to get status information for a flight
            await requestFlightStatusFromOracles(flight, timestamp, 10);

            let flightStatus = await config.flightSuretyApp.viewFlightStatus(flight, timestamp);
            assert.equal(STATUS_CODE_ON_TIME, flightStatus.toString(10));

        })
    });

    describe("Users", async () => {
        it('Contract owner can register new user', async () => {
            await config.flightSuretyApp.registerUser(config.admins[0], true, {from: config.owner});

            let result = await config.flightSuretyApp.isUserRegistered.call(config.admins[0]);
            assert.equal(result, true, "Contract owner cannot register new user");
        });

        it('user is registration when multi-party threshold is reached', async () => {
            await config.flightSuretyApp.registerUser(config.admins[1], true, {from: config.owner});
            await config.flightSuretyApp.registerUser(config.admins[2], true, {from: config.owner});

            let startStatus = await config.flightSuretyApp.isOperational.call();
            let changeStatus = !startStatus;

            await config.flightSuretyApp.setOperatingStatus(changeStatus, {from: config.admins[1]});
            await config.flightSuretyApp.setOperatingStatus(changeStatus, {from: config.admins[2]});

            let newStatus = await config.flightSuretyApp.isOperational.call();

            assert.equal(changeStatus, newStatus, "Multi-party call failed");

            //REVERT STATUS
            await config.flightSuretyApp.setOperatingStatus(!newStatus, {from: config.admins[1]});
            await config.flightSuretyApp.setOperatingStatus(!newStatus, {from: config.admins[2]});

        });
    });

    describe("Airlines", () => {
        it('First airline is registered at contract deployment', async () => {
            assert.equal(true, await config.flightSuretyApp.isAirlineRegistered(config.airlines[0].name));
        })

        it("Only existing airline may register a new airline until there are at least four airlines registered", async () => {
            let newAirline = config.airlines[1];
            let existingAirline = config.airlines[0];
            let notAirline = config.users[0];

            await truffleAssert.reverts(config.flightSuretyApp.registerAirline(newAirline.name, newAirline.address, {from: notAirline}))
            await truffleAssert.passes(config.flightSuretyApp.registerAirline(newAirline.name, newAirline.address, {from: existingAirline.address}))
        })

        it('Airline can send funds to contract', async () => {
            let initialFunding = web3.utils.toWei("10", "ether")
            let airline = config.airlines[0];

            await config.flightSuretyApp.fundAirline({from: airline.address, value: initialFunding});

            let funding = await config.flightSuretyApp.getAirlineFunding(airline.name);
            assert.equal(initialFunding, funding.toString(10));
        })

        it("Airline can be registered, but does not participate in contract until it submits funding of 10 ether", async () => {
            let existingAirline = config.airlines[0].address;
            let airline = config.airlines[2];
            let user = config.users[0];
            await config.flightSuretyApp.registerAirline(airline.name, airline.address, {from: existingAirline})

            await truffleAssert.reverts(config.flightSuretyApp.buyInsuranceForFlight(airline.name, "Flight", {
                from: user,
                value: config.weiMultiple
            }))
            await truffleAssert.reverts(config.flightSuretyApp.registerFlight(airline.name, "Flight", Date.now(), {from: user}))
        })

        it('Registration of fifth and subsequent airlines requires multi-party consensus of 50% of registered airlines', async () => {
            //register 4th airline first
            await config.flightSuretyApp.registerAirline(config.airlines[3].name, config.airlines[3].address, {from: config.airlines[0].address})

            let voter1 = config.airlines[0].address;
            let voter2 = config.airlines[1].address;

            //vote 1
            await config.flightSuretyApp.registerAirline(config.airlines[4].name, config.airlines[4].address, {from: voter1})
            //vote 2, 50% of registered airlines count
            let result = await config.flightSuretyApp.registerAirline(config.airlines[4].name, config.airlines[4].address, {from: voter2})

            truffleAssert.eventEmitted(result, 'AirlineRegistered', (ev) => {
                return ev.name === config.airlines[4].name
            });
        })

    });

    describe("Flights", async () => {
        it('Can register a flight', async () => {
            let result = await config.flightSuretyApp.registerFlight(config.airlines[0].name, "AL1FL1", new Date().getSeconds())
            truffleAssert.eventEmitted(result, "FlightRegistered", (ev) => {
                return ev.airline === config.airlines[0].name && ev.flight === "AL1FL1"
            });
        })
    });

    describe("Insurance", async () => {
        it('Passengers may pay up to 1 ether for purchasing flight insurance.', async () => {
            let amountToPay = web3.utils.toWei("1", "ether")

            await config.flightSuretyApp.registerFlight(config.airlines[0].name, "Flight", new Date().getSeconds())

            let userBalanceBefore = await web3.eth.getBalance(config.users[0]);

            let result = await config.flightSuretyApp.buyInsuranceForFlight(config.airlines[0].name, "Flight", {
                from: config.users[0],
                value: amountToPay
            });

            let userBalanceAfter = await web3.eth.getBalance(config.users[0]);
            let gas = result.receipt.gasUsed * await web3.eth.getGasPrice();

            assert.equal(userBalanceAfter, userBalanceBefore - amountToPay - gas);

            await config.flightSuretyApp.registerFlight(config.airlines[0].name, "AL1FL2", new Date().getSeconds())
        });

        const STATUS_CODE_LATE = 99;

        it('If flight is delayed due to airline fault, passenger receives credit of 1.5X the amount they paid', async () => {
            //BUY INSURANCE FOR USER
            //REQUEST FLIGHT INFO FROM ORACLES
            //PROCESS LATE FLIGHT INFO FROM ORACLES
            //USER CAN REQUEST FUNDS

            let airline = config.airlines[0];
            let flight = airline.name + 'Flight2';
            let timestamp = Math.floor(Date.now() / 1000);
            let insurancePayment = web3.utils.toWei("1", "ether")
            let user = config.users[0];

            //PREPARE AIRLINE AND FLIGHT
            await config.flightSuretyApp.registerFlight(airline.name, flight, new Date().getSeconds())

            // BUY INSURANCE FOR USER
            await config.flightSuretyApp.buyInsuranceForFlight(airline.name, flight, {
                from: user,
                value: insurancePayment
            });

            //Check - Insurance payouts are not sent directly to passenger’s wallet
            let userBalanceBefore = await web3.eth.getBalance(user);

            //REQUEST FLIGHT INFO FROM ORACLES
            await requestFlightStatusFromOracles(flight, timestamp, STATUS_CODE_LATE);

            //PROCESS LATE FLIGHT INFO FROM ORACLES - triggered automatically by oracles

            let creditedInsurance = await config.flightSuretyApp.getCustomerFlightInsurance(flight, {from: user});
            assert.equal(insurancePayment * 1.5, creditedInsurance)

            let userBalanceAfter = await web3.eth.getBalance(user);
            assert.equal(userBalanceBefore, userBalanceAfter)

        })

        //DEPENDS ON BUYING INSURANCE IN PREVIOUS TEST
        it('Passenger can withdraw any funds owed to them as a result of receiving credit for insurance payout', async () => {
            let airline = config.airlines[0];
            let flight = airline.name + 'Flight2';
            let insurancePayment = web3.utils.toWei("1", "ether")
            let user = config.users[0];

            //CLAIM INSURANCE
            let userBalanceBefore = await web3.eth.getBalance(user);

            let result = await config.flightSuretyApp.claimInsurance(flight, {from: user});

            let gas = result.receipt.gasUsed * await web3.eth.getGasPrice();
            let userBalanceAfter = await web3.eth.getBalance(user);
            let insurancePayout = BigNumber(insurancePayment).multipliedBy(1.5)

            assert.equal(
                BigNumber(userBalanceBefore).plus(insurancePayout).toString(10),
                BigNumber(userBalanceAfter).plus(gas).toString(10))
        })

    });

    async function requestFlightStatusFromOracles(flight, timestamp, status) {
        let oracleIndex = await findRelevantIndex(flight, timestamp);

        for (let a = 0; a < config.oracles.length; a++) {
            let oracleIndexes = await config.flightSuretyApp.getOracle(config.oracles[a]);
            for (let idx = 0; idx < 3; idx++) {
                if (oracleIndexes[idx] == oracleIndex) {
                    try {
                        await config.flightSuretyApp.submitOracleResponse(oracleIndexes[idx], flight, timestamp, status, {from: config.oracles[a]})
                        // console.log("Submitted response")
                    } catch (ex) {
                        // console.log(ex);
                    }
                }
            }
        }
    }

    //May need to rerun `fetchFlightStatus` because of limited number of oracles to get enough oracles with matching index
    async function findRelevantIndex(flight, timestamp) {
        let oracleIndex;
        let matchCount;
        do {
            matchCount = 0;
            let flightStatusRequest = await config.flightSuretyApp.fetchFlightStatus(flight, timestamp);

            let process = false;
            truffleAssert.eventEmitted(flightStatusRequest, 'OracleRequest', (ev) => {
                oracleIndex = ev.index.toString(10);
                process = true;
                return true;
            });

            if (process) {
                for (let a = 0; a < config.oracles.length; a++) {
                    let oracleIndexes = await config.flightSuretyApp.getOracle(config.oracles[a]);
                    for (let b = 0; b < 3; b++) {
                        if (oracleIndex == oracleIndexes[b]) {
                            matchCount++;
                            break
                        }
                    }
                }
            }
        } while (matchCount < 3)
        return oracleIndex;
    }

});
