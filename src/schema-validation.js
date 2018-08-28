import Ajv from 'ajv';
import ORIGIN_schema from './schemas/v1/ORIGIN.json';
import COM_CONTROL_schema from './schemas/v1/COM_CONTROL.json';
import PAYMENT_CHANNEL_schema from './schemas/v1/PAYMENT_CHANNEL.json';
import UPGRADE_VERSION_schema from './schemas/v1/UPGRADE_VERSION.json';
import SIGNAL_STOP_schema from './schemas/v1/SIGNAL_STOP.json';
import TERMINATE_schema from './schemas/v1/TERMINATE.json';
import ADD_LIST_schema from './schemas/v1/ADD_LIST.json';


//We make specific validators per message because it becomes easier portable
//and making 1 big schema that should use different validations based on a field
//that is in the message is complex and unreadable.
//And it performs way better.
var validatorsV1 = {
    "ORIGIN" : new Ajv().compile(ORIGIN_schema),
    "COM_CONTROL" : new Ajv().compile(COM_CONTROL_schema),
    "PAYMENT_CHANNEL" : new Ajv().compile(PAYMENT_CHANNEL_schema),
    "UPGRADE_VERSION" : new Ajv().compile(UPGRADE_VERSION_schema),
    "SIGNAL_STOP" : new Ajv().compile(SIGNAL_STOP_schema),
    "TERMINATE" : new Ajv().compile(TERMINATE_schema),
    "ADD_LIST" : new Ajv().compile(ADD_LIST_schema),
}

//Used to obtain errors
var latestValidator = {
    errors: "No validator"
}

/**
 * Wrapper function to take any IOTAPAY message and pick the right validator.
 * @param {*} json 
 */
export function validate(json) {
    if(typeof(json) === "object" && json.msgType && validatorsV1[json.msgType]){
        var validator = validatorsV1[json.msgType];
        if(validator){
            latestValidator = validator;
            return validator(json);
        }
    }
    latestValidator = {
        errors: []
    }
    if(typeof(json) !== "object"){
        latestValidator.errors.push("Given data is not an object");
    }

    if(!json.msgType){
        latestValidator.errors.push("Missing msgType on object");
    }

    if(json.msgType && !validatorsV1[json.msgType]){
        latestValidator.errors.push("Unknown message type given: " + json.msgType);
    }
    
    return false;

}
/**
 * Wrapper function to get the errors of the latest used json validator
 */
export function getErrors() {
    return latestValidator.errors;
}
