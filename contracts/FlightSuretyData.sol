pragma solidity ^0.4.25;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./FlightSuretyDataInterface.sol";

contract FlightSuretyData is FlightSuretyDataInterface {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/
    struct Airline {
        string airlineName;
        address airlineAddress;
        uint256 funds;
    }

    struct Flight {
        string airline;
        string flight;
        uint256 timestamp;
    }

    address contractOwner;
    bool private operational = true;
    mapping(address => bool) private authorizedContracts;

    mapping(string => Airline) airlines;
    mapping(address => string) airlineAddressToName;
    uint airlinesCount;

    mapping(string => Flight) private flights;

    struct FlightInsurance {
        mapping(address => uint256) customerBalances;
        bool isProcessed;
    }

    mapping(string => address[]) private flightInsuredAddresses;
    mapping(string => FlightInsurance) private insurancePayments;

    constructor() public {
        contractOwner = msg.sender;
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    modifier callerAuthorized()
    {
        require(authorizedContracts[msg.sender], "Caller is not authorised");
        _;
    }

    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireAirlineIsRegistered(string name)
    {
        require(airlines[name].airlineAddress != address(0), "Airline is not registered");
        _;
    }

    modifier requireAirlineAddressIsRegistered(address airlineAddress)
    {
        string memory name = airlineAddressToName[airlineAddress];
        require(airlines[name].airlineAddress != address(0), "Airline address is not registered");
        _;
    }

    modifier requireFlightIsRegistered(string flight)
    {
        require(flights[flight].timestamp > 0, "Flight is not registered");
        _;
    }


    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function authorizeContract(address contractAddress) external {
        authorizedContracts[contractAddress] = true;
    }

    function deauthorizeContract(address contractAddress) external requireContractOwner {
        delete authorizedContracts[contractAddress];
    }

    function setOperatingStatus(bool _operational) external callerAuthorized {
        operational = _operational;
    }

    function getOperatingStatus() external callerAuthorized view returns (bool){
        return operational;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
     * @dev Save airline registration
    *      Can only be called from FlightSuretyApp contract
    *
    */
    function registerAirline(string airlineName, address airlineAddress) external callerAuthorized {
        require(airlines[airlineName].airlineAddress == address(0), "Airline is already registered");

        Airline memory airline = Airline({airlineName : airlineName, airlineAddress : airlineAddress, funds : 0});
        airlines[airlineName] = airline;

        airlineAddressToName[airlineAddress] = airlineName;
        airlinesCount++;
    }

    /**
    * @dev Check if airline by name is registered
    *
    * @return A bool indicating if airline is registered
    */

    function isAirlineRegistered(string airlineName) external callerAuthorized view returns (bool){
        return airlines[airlineName].airlineAddress != address(0);
    }

    /**
    * @dev Check if airline address is registered
    *
    * @return A bool indicating if airline address is registered
    */

    function isAirlineAddressRegistered(address airlineAddress) public callerAuthorized view returns (bool)  {
        string memory airlineName = airlineAddressToName[airlineAddress];
        return airlines[airlineName].airlineAddress != address(0);
    }

    /**
    * @dev How many airlines are registered
    *
    * @return Number of registered airlines
    */

    function registeredAirlinesCount() external callerAuthorized view returns (uint){
        return airlinesCount;
    }

    /**
    * @dev Airline sends funds for insurance payments
    *
    */
    function fundAirline(address airlineAddress, uint256 amount)
    public
    callerAuthorized
    requireAirlineAddressIsRegistered(airlineAddress)
    {
        string memory name = airlineAddressToName[airlineAddress];
        Airline storage airline = airlines[name];
        airline.funds = airline.funds.add(amount);
    }

    /**
    * @dev Get total airline funding
    *
    * @return Airline funding in WEI
    */
    function getAirlineFunding(string airline) external callerAuthorized view returns (uint256){
        return airlines[airline].funds;
    }

    /**
     * @dev Register a future flight for insuring.
    *
    */
    function registerFlight(string _airline, string _flight, uint256 _timestamp)
    external
    callerAuthorized
    requireAirlineIsRegistered(_airline)
    {
        flights[_flight] = Flight({airline : _airline, flight : _flight, timestamp : _timestamp});
        insurancePayments[_flight] = FlightInsurance({isProcessed : false});
    }

    /**
    * @dev Check if flight is registered
    *
    * @return A bool indicating if flight is registered
    */
    function isFlightRegistered(string flight) external callerAuthorized view returns (bool){
        return flights[flight].timestamp > 0;
    }

    /**
     * @dev Buy insurance for a flight
    *
    */
    function buyInsurance(string flightName, address customer, uint256 amount)
    external
    callerAuthorized
    requireFlightIsRegistered(flightName)
    {
        require(customer != address(0), "Invalid customer address");

        Flight memory flight = flights[flightName];
        Airline memory airline = airlines[flight.airline];

        fundAirline(airline.airlineAddress, amount);

        FlightInsurance storage flightInsurance = insurancePayments[flightName];
        uint256 balance = flightInsurance.customerBalances[customer];
        flightInsurance.customerBalances[customer] = balance.add(amount);

        flightInsuredAddresses[flightName].push(customer);
    }

    /**
    * @dev Get insurance amount what user has paid for a flight
    *
    * @return A bool indicating if flight is registered
    */
    function getCustomerFlightInsurance(string flight, address customer) external callerAuthorized returns (uint256){
        FlightInsurance storage flightInsurance = insurancePayments[flight];
        return flightInsurance.customerBalances[customer];
    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees(string flight, uint256 percentage)
    external
    callerAuthorized
    requireFlightIsRegistered(flight)
    {
        FlightInsurance storage flightInsurance = insurancePayments[flight];
        require(!flightInsurance.isProcessed, "Already credited");

        address[] memory addresses = flightInsuredAddresses[flight];
        for (uint256 i = 0; i < addresses.length; i++) {
            uint256 initialPayment = flightInsurance.customerBalances[addresses[i]];
            flightInsurance.customerBalances[addresses[i]] = initialPayment.mul(percentage).div(100);
        }

        flightInsurance.isProcessed = true;
    }

    /**
     *  @dev Transfers eligible payout funds to customer
     *
    */
    function claimInsurance(string flight, address customer) external callerAuthorized requireFlightIsRegistered(flight) {
        FlightInsurance storage flightInsurance = insurancePayments[flight];
        uint256 balance = flightInsurance.customerBalances[customer];

        require(balance > 0, "Nothing to pay out");

        flightInsurance.customerBalances[customer] = 0;
        customer.transfer(balance);
    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flights
    *      resulting in insurance payouts, the contract should be self-sustaining
    *
    */
    function fund() public payable {}

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    function() external payable {
        fund();
    }

}