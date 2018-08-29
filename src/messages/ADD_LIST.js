
import * as util from '../iota-pay-static';
import * as schemaValidation from '../schema-validation';
/**
 * Generates a new message, it is imparitive to use the latest control message availble.
 * You can fuck-up your IOTA pay reference by using an earlier control message.
 * @param {*} latestPaymentChannelMessage 
 * @param {*} addresses 
 * @param {*} privateKeyPEM 
 * @param {*} pemPassword 
 */
export function generateMessage(latestPaymentChannelMessage, addresses, privateKeyPEM, pemPassword = null) {
    // sign(msgType + addresses)
    if(latestPaymentChannelMessage.msgType !== "PAYMENT_CHANNEL" ||
     !latestPaymentChannelMessage.msg.controlIndex ||
     !latestPaymentChannelMessage.msg.timestampIndex){
        throw "Requires a PAYMENT_CHANNEL message";
    }
   
    
    var toReturn = {
        "msgType": "ADD_LIST",
        "msg": {
          "timestampIndex" : latestPaymentChannelMessage.msg.timestampIndex,
          "offspringIndex": latestPaymentChannelMessage.msg.offspringIndex,
          "addresses" : addresses
        }
      }
    toReturn.signature = util.sign(privateKeyPEM, pemPassword, util.getSignatureFragment(toReturn));   
  
    if(schemaValidation.validate(toReturn)){
        return toReturn;
    }else{
        throw schemaValidation.getErrors();
    }
}


export function verifySignature(message, publicKey) {
    // sign(msgType  + addresses)

  var toVerify = "ADD_LIST" + 
      message.msg.timestampIndex.toString() + message.msg.offspringIndex.toString() +
      addressesToConsistentString(message.msg.addresses);         
  return util.verify(publicKey, message.signature, util.getSignatureFragment(message));
}


function addressesToConsistentString(addresses) {
    var toReturn = [];
    for(var i =0; i < addresses.length; i++){
        toReturn.push(addresses[i].i + ":" + addresses[i].a);
    }       
    return toReturn.join(":");
}
