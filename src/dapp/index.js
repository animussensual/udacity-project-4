import DOM from './dom';
import Contract from './contract';
import './flightsurety.css';


(async () => {

    let result = null;

    let contract = new Contract('localhost', () => {

        // Read transaction
        showOPerationalStatus(contract);

        // User-submitted transaction
        allowToRequestFlightStatus(contract);

        showAirlinesAndFligths(contract);
        displayUSers(contract);

        DOM.elid("buy-insurance").addEventListener("click", () => {
            let amount = DOM.elid("insurance-amount").value
            let user = DOM.elid("Users").value
            let airline = DOM.elid("Airlines").value
            let flight = DOM.elid("Flights").value
            contract.buyInsurance(user, airline, flight, amount)
        })

        DOM.elid("claim-insurance").addEventListener("click", () => {
            let user = DOM.elid("Users").value
            let flight = DOM.elid("Flights").value
            contract.claimInsurance(user, flight)
        })

    });


})();

function displayUSers(contract) {
    displayAsSelect(
        "users-display-wrapper",
        'Users',
        'User addresses',
        contract.passengers.map((us) => {
            return {
                "value": us,
                "text": us
            }
        }),
        "Users",
        "UsersSection"
    )
}

function showAirlinesAndFligths(contract) {
    let airlinesSelect = displayAsSelect(
        "airline-display-wrapper",
        'Airlines',
        'Registered airlines',
        contract.airlines.map((al) => {
            return {
                "value": al.name,
                "text": al.name
            }
        }),
        "Airlines",
        "AirlinesSection"
    )


    airlinesSelect.addEventListener("change", () => {
        updateFlights(contract)
    });
    updateFlights(contract)
}

function showOPerationalStatus(contract) {
    contract.isOperational((error, result) => {
        displayAsText(
            "status-display-wrapper",
            'Operational Status', 'Check if contract is operational', [{
                label: 'Operational Status',
                error: error,
                value: result
            }]);
    });
}

function allowToRequestFlightStatus(contract) {
    DOM.elid('submit-oracle').addEventListener('click', () => {
        let flight = DOM.elid("Flights").value
        // Write transaction
        contract.fetchFlightStatus(flight, (error, result) => {
            displayAsText(
                "oracles-display-wrapper",
                'Oracles', 'Trigger oracles', [{
                    label: 'Fetch Flight Status',
                    error: error,
                    value: result.flight + ' ' + result.timestamp
                }]);
        });
    })
}

function updateFlights(contract) {
    let airlineName = DOM.elid("Airlines").value
    let airline = contract.airlines.find(al => al.name === airlineName)
    displayAsSelect(
        "flights-display-wrapper",
        'Flights',
        'Available flights',
        airline.flights.map((fl) => {
            return {
                "value": fl,
                "text": fl
            }
        }),
        "Flights",
        "FlightsSection"
    )
}

function displayAsText(wrapperId, title, description, results) {
    let displayDiv = DOM.elid(wrapperId);
    displayDiv.innerHTML = ""
    let section = DOM.section();
    section.appendChild(DOM.h2(title));
    section.appendChild(DOM.h5(description));
    results.map((result) => {
        let row = section.appendChild(DOM.div({className: 'row'}));
        row.appendChild(DOM.div({className: 'col-sm-4 field'}, result.label));
        row.appendChild(DOM.div({className: 'col-sm-8 field-value'}, result.error ? String(result.error) : String(result.value)));
        section.appendChild(row);
    })
    displayDiv.append(section);

}

function displayAsSelect(wrapperId, title, description, results, selectId, sectionId) {
    let displayDiv = DOM.elid(wrapperId);
    displayDiv.innerHTML = ""
    let section = DOM.section({"id": sectionId});
    section.appendChild(DOM.h2(title));
    section.appendChild(DOM.h5(description));
    let options = results.map((result) => {
        return DOM.option({
            'value': result.value,
            'text': result.text
        })
    })
    let select = DOM.select({"id": selectId}, options);
    section.appendChild(select);
    displayDiv.append(section);
    return select;
}






