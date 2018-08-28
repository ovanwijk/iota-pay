
import * as util from '../iota-pay-static';
import * as schemaValition from '../schema-validation';

/**
 * Generates a new message, it is imparitive to use the latest control message availble.
 * You can fuck-up your IOTA pay reference by using an earlier control message.
 * @param {*} latestControlMessage 
 * @param {*} channelName 
 * @param {*} offspringIndex 
 * @param {*} validations 
 * @param {*} originSeed 
 * @param {*} privateKeyPEM 
 * @param {*} pemPassword 
 */
export function generateMessage(latestControlMessage, channelName, offspringIndex, validations, originSeed, privateKeyPEM, pemPassword = null) {
    // sign(msgType + timestampIndex + controlIndex + reference + seedIndex + validations)
    
    if((!latestControlMessage.msg.controlIndex && latestControlMessage.msg.controlIndex !== 0) || !latestControlMessage.msg.timestampIndex){
        throw "Requires a control messages";
    }
    var offspringSeed = util.generateOffspringSeed(originSeed, channelName, offspringIndex);
    var offspringReference = util.generateOffspringReference(
        offspringSeed,
        channelName);
    var newControlIndex = latestControlMessage.msg.controlIndex + 1;
  
    var toReturn = {
        "msgType": "PAYMENT_CHANNEL",
        "msg": {
          "controlIndex" : newControlIndex,
          "timestampIndex" : latestControlMessage.msg.timestampIndex,
          "offspringIndex" : offspringIndex,        
          "offspringReference" : offspringReference,
          "validations" : validations,
        }
      }
      toReturn.signature = util.sign(privateKeyPEM, pemPassword, util.getSignatureFragment(toReturn));

    if(schemaValition.validate(toReturn)){
        return toReturn;
    }else{
        throw schemaValition.getErrors();
    }
}


export function verifySignature(message, publicKey) {
    // sign(msgType + timestampIndex + controlIndex + reference + seedIndex + validations)

  return util.verify(publicKey, message.signature,  util.getSignatureFragment(message));
}

export function generateValidationMethod(method, args){
    if(!Array.isArray(args)){
        throw "args must be an array";
    }
    return {
        method: method,
        arguments: args
    }
}


