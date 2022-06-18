pragma solidity ^0.4.25;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./FlightSuretyDataInterface.sol";

/************************************************** */
/* FlightSurety Smart Contract                      */
/************************************************** */
contract FlightSuretyApp {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    struct UserProfile {
        bool isRegistered;
        bool isAdmin;
    }

    address private contractOwner;
    mapping(address => UserProfile) private userProfiles;
    uint private constant M = 2;
    address[] private multiCalls = new address[](0);


    FlightSuretyDataInterface private dataContract;

    struct AirlineRegistration {
        string name;
        address airlineAddress;
        uint256 votesCount;
        mapping(address => bool) voters;
    }

    //this mapping is lost on new contract deployment, only for pending registration
    mapping(string => AirlineRegistration) private airlinesRegistrations;

    uint256 public constant AIRLINE_REG_VOTING_THRESHOLD = 4;
    uint256 public constant AIRLINE_REG_MULTI_RATIO = 50;
    uint256 public constant AIRLINE_MANDATORY_FUNDING = 10 ether;

    //simple rules(parameters) for flight insurance payment
    uint256 public constant FLIGHT_MAXIMUM_INSURANCE = 1 ether;
    uint256 public constant INSURANCE_PAYMENT_PERCENTAGE = 150;

    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor(address dataContractAddress, string airlineName, address airlineAddress) public {
        contractOwner = msg.sender;
        dataContract = FlightSuretyDataInterface(dataContractAddress);
        dataContract.authorizeContract(address(this));

        //On next deployment this might be not required depending on requirements
        dataContract.registerAirline(airlineName, airlineAddress);
        emit AirlineRegistered(airlineName);
    }


    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/

    event AirlineRegistered(string name);

    event FlightRegistered(string airline, string flight);

    event InsuranceCredited(string flight);

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireOperational()
    {
        require(isOperational(), "Contract is paused");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev  Changes contract operating status
      *
    */
    function setOperatingStatus(bool _operational) external {
        require(userProfiles[msg.sender].isAdmin, "Caller is not an admin");
        require(_operational != isOperational(), "New mode must be different from existing mode");

        bool isDuplicate = false;
        for (uint c = 0; c < multiCalls.length; c++) {
            if (multiCalls[c] == msg.sender) {
                isDuplicate = true;
                break;
            }
        }
        require(!isDuplicate, "Caller has already called this function.");

        multiCalls.push(msg.sender);
        if (multiCalls.length >= M) {
            dataContract.setOperatingStatus(_operational);
            multiCalls = new address[](0);
        }
    }

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */
    function isOperational() public view returns (bool){
        return dataContract.getOperatingStatus();
    }

    /**
    * @dev Register user
    *
    */
    function registerUser(address account, bool isAdmin) external requireOperational requireContractOwner {
        require(!userProfiles[account].isRegistered, "User is already registered.");

        userProfiles[account] = UserProfile({isRegistered : true, isAdmin : isAdmin});
    }

    /**
     * @dev Check if a user is registered
    *
    * @return A bool that indicates if the user is registered
    */
    function isUserRegistered(address account) external view returns (bool){
        require(account != address(0), "'account' must be a valid address.");
        return userProfiles[account].isRegistered;
    }


    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
    * @dev Registers airline, if AIRLINE_REG_VOTING_THRESHOLD is exceeded then requires at least  AIRLINE_REG_MULTI_RATIO votes
    *
    */
    function registerAirline(string airlineName, address airlineAddress) external requireOperational {
        require(dataContract.isAirlineAddressRegistered(msg.sender), "Airline is not registered");

        //this assumes that count depends only on registration and not (initial) funding
        uint count = dataContract.registeredAirlinesCount();

        if (count < AIRLINE_REG_VOTING_THRESHOLD) {
            dataContract.registerAirline(airlineName, airlineAddress);
            emit AirlineRegistered(airlineName);
        } else {
            AirlineRegistration storage registration = airlinesRegistrations[airlineName];

            if (registration.airlineAddress == address(0)) {
                airlinesRegistrations[airlineName] = AirlineRegistration({name : airlineName, airlineAddress : airlineAddress, votesCount : 1});
                registration.voters[msg.sender] = true;
            }
            else {
                require(!registration.voters[msg.sender], "Airline has already voted");
                require(registration.airlineAddress == airlineAddress, "Expected different airline address");

                registration.votesCount++;
                registration.voters[msg.sender] = true;

                if (registration.votesCount.mul(100).div(count) >= AIRLINE_REG_MULTI_RATIO) {
                    dataContract.registerAirline(airlineName, airlineAddress);
                    emit AirlineRegistered(airlineName);

                    //registration is complete, clean up
                    delete airlinesRegistrations[airlineName];

                }
            }
        }
    }

    /**
    * @dev Check if airline by name is registered
    *
    * @return A bool indicating if airline is registered
    */
    function isAirlineRegistered(string name) public view returns (bool) {
        return dataContract.isAirlineRegistered(name);
    }

    /**
    * @dev Check if airline address is registered
    *
    * @return A bool indicating if airline address is registered
    */
    function isAirlineAddressRegistered(address name) public view returns (bool) {
        return dataContract.isAirlineAddressRegistered(name);
    }

    /**
    * @dev Airline sends funds for insurance payments
    *
    */
    function fundAirline() external payable requireOperational {
        require(dataContract.isAirlineAddressRegistered(msg.sender), "Airline is not registered");
        address(dataContract).transfer(msg.value);
        dataContract.fundAirline(msg.sender, msg.value);
    }

    /**
    * @dev Get total airline funding
    *
    * @return Airline funding in WEI
    */
    function getAirlineFunding(string airline) public view returns (uint256)  {
        return dataContract.getAirlineFunding(airline);
    }

    /**
    * @dev User can buy insurance for a flight
    *
    */
    function buyInsuranceForFlight(string airline, string flight) external payable requireOperational {
        require(dataContract.getAirlineFunding(airline) >= AIRLINE_MANDATORY_FUNDING, "Airline funding is below required balance");
        uint256 existingPayment = dataContract.getCustomerFlightInsurance(flight, msg.sender);
        require(existingPayment.add(msg.value) <= FLIGHT_MAXIMUM_INSURANCE, "Maximum insurance for a flight is exceeded");

        address(dataContract).transfer(msg.value);
        dataContract.buyInsurance(flight, msg.sender, msg.value);
    }

    /**
    * @dev Get insurance amount what user has paid for a flight
    *
    * @return A bool indicating if flight is registered
    */
    function getCustomerFlightInsurance(string flight) external requireOperational view returns (uint256){
        return dataContract.getCustomerFlightInsurance(flight, msg.sender);
    }

    /**
     * @dev Register a future flight for insuring.
    *
    */
    function registerFlight(string airline, string flight, uint256 timestamp) external requireOperational {
        require(dataContract.getAirlineFunding(airline) >= AIRLINE_MANDATORY_FUNDING, "Airline funding is below required balance");

        dataContract.registerFlight(airline, flight, timestamp);
        emit FlightRegistered(airline, flight);
    }

    /**
    * @dev Check if flight is registered
    *
    * @return A bool indicating if flight is registered
    */
    function isFlightRegistered(string flight) external view returns (bool){
        return dataContract.isFlightRegistered(flight);
    }

    /**
    * @dev Callback method for oracles to submit light status
    *
    */
    function submitOracleResponse(uint8 index, string flight, uint256 timestamp, uint8 statusId) external requireOperational {
        uint8[3] memory indexes = oracles[msg.sender];
        require((indexes[0] == index) || (indexes[1] == index) || (indexes[2] == index), "Index does not match oracle request");

        bytes32 key = keccak256(abi.encodePacked(index, flight, timestamp));
        require(oracleResponses[key].isOpen, "Flight or timestamp do not match oracle request");

        oracleResponses[key].responses[statusId].push(msg.sender);

        if (oracleResponses[key].responses[statusId].length >= MIN_RESPONSES) {

            oracleResponses[key].isOpen = false;

            bytes32 flightKey = keccak256(abi.encodePacked(flight, timestamp));
            flights[flightKey] = FlightStatus(true, statusId);

            processFlightStatus(flight, statusId);
            emit FlightStatusInfo(flight, timestamp, statusId, true);
        } else {
            // Oracle submitting response but MIN_RESPONSES threshold not yet reached
            emit FlightStatusInfo(flight, timestamp, statusId, false);
        }
    }

    /**
     * @dev Called after oracle has updated flight status
    *
    */
    function processFlightStatus(string flight, uint8 status) internal {
        if (status != ON_TIME) {
            dataContract.creditInsurees(flight, INSURANCE_PAYMENT_PERCENTAGE);
            emit InsuranceCredited(flight);
        }
    }

    /**
    * @dev Called by a insured customers to claim their insurance
    *
    */
    function claimInsurance(string flight) external requireOperational {
        dataContract.claimInsurance(flight, msg.sender);
    }

    /**
      * @dev Fallback function for funding smart contract.
      *
    */
    function() external payable {
        revert("Please don't send funds directly");
    }

    /********************************************************************************************/
    /*                                     ORACLES "CONTRACT"                                   */
    /********************************************************************************************/

    // Incremented to add pseudo-randomness at various points
    uint8  nonce = 0;

    // Fee to be paid when registering oracle
    uint256 public constant REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256  constant MIN_RESPONSES = 2;

    // Status codes returned by oracles
    uint8  constant ON_TIME = 10;
    uint8  constant NOT_ON_TIME = 99;

    // Track all registered oracles
    mapping(address => uint8[3])  oracles;

    // Flight data persisted forever
    struct FlightStatus {
        bool hasStatus;
        uint8 status;
    }

    mapping(bytes32 => FlightStatus) flights;

    // Model for responses from oracles
    struct ResponseInfo {
        address requester;
        bool isOpen;
        mapping(uint8 => address[]) responses;
    }

    mapping(bytes32 => ResponseInfo)  oracleResponses;


    event OracleRequest(uint8 index, string flight, uint256 timestamp);

    event FlightStatusInfo(string flight, uint256 timestamp, uint8 status, bool verified);

    function registerOracle() external payable {
        require(msg.value >= REGISTRATION_FEE, "Insufficient registration fee");

        uint8[3] memory indexes = generateIndexes(msg.sender);
        oracles[msg.sender] = indexes;
    }

    function getOracle(address account) external view returns (uint8[3]){
        return oracles[account];
    }

    // Generate a request
    function fetchFlightStatus(string flight, uint256 timestamp) external {
        // Generate a number between 0 - 9 to determine which oracles may respond
        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        bytes32 key = keccak256(abi.encodePacked(index, flight, timestamp));

        oracleResponses[key] = ResponseInfo({requester : msg.sender, isOpen : true});

        emit OracleRequest(index, flight, timestamp);
    }

    function viewFlightStatus(string flight, uint256 timestamp) public view returns (uint8){
        bytes32 flightKey = keccak256(abi.encodePacked(flight, timestamp));
        require(flights[flightKey].hasStatus, "Flight status not available");

        return flights[flightKey].status;
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes(address account) internal returns (uint8[3])
    {
        uint8[3] memory indexes;
        indexes[0] = getRandomIndex(account);

        indexes[1] = indexes[0];
        while (indexes[1] == indexes[0]) {
            indexes[1] = getRandomIndex(account);
        }

        indexes[2] = indexes[1];
        while ((indexes[2] == indexes[0]) || (indexes[2] == indexes[1])) {
            indexes[2] = getRandomIndex(account);
        }

        return indexes;
    }

    // Returns array of three non-duplicating integers from 0-9
    function getRandomIndex(address account) internal returns (uint8){
        uint8 maxValue = 10;

        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(uint256(keccak256(abi.encodePacked(blockhash(block.number - nonce++), account))) % maxValue);

        if (nonce > 250) {
            nonce = 0;
            // Can only fetch block hashes for last 256 blocks so we adapt
        }

        return random;
    }
}