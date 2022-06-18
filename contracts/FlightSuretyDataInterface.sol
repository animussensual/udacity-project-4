pragma solidity ^0.4.25;

interface FlightSuretyDataInterface {
    function authorizeContract(address contractAddress) external;

    function deauthorizeContract(address contractAddress) external;

    function setOperatingStatus(bool) external;

    function getOperatingStatus() external view returns (bool);

    function registerAirline(string airlineName, address airlineAddress) external;

    function isAirlineRegistered(string name) external view returns (bool);

    function isAirlineAddressRegistered(address airlineAddress) external view returns (bool);

    function registeredAirlinesCount() external view returns (uint);

    function fundAirline(address airlineAddress, uint256 amount) external;

    function getAirlineFunding(string airline) external view returns (uint256);

    function registerFlight(string airline, string flight, uint256 timestamp) external;

    function isFlightRegistered(string flight) external view returns (bool);

    function buyInsurance(string flight, address customerAddress, uint256 amount) external;

    function getCustomerFlightInsurance(string flight, address customer) external returns (uint256);

    function claimInsurance(string flight, address customer) external;

    function creditInsurees(string flight, uint256 percentage) external;

    function fund() external;
}
