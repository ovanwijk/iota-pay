
import * as util from '../iota-pay-static';
import * as schemaValidation from '../schema-validation';
/**
 * Generates a new message, it is imparitive to use the latest control message availble.
 * You can fuck-up your IOTA pay reference by using an earlier control message.
 * @param {*} latestControlMessage 
 * @param {*} reference 
 * @param {*} privateKeyPEM 
 * @param {*} pemPassword 
 */
export function generateMessage(latestControlMessage, reference, privateKeyPEM, pemPassword = null) {
    // sign(msgType  + timestampIndex + controlIndex + reference)
    if((!latestControlMessage.msg.controlIndex && latestControlMessage.msg.controlIndex !== 0) || !latestControlMessage.msg.timestampIndex){
        throw "Requires a control messages";
    }
   
    var newControlIndex = latestControlMessage.msg.controlIndex + 1;
     
    var toReturn = {
        "msgType": "UPGRADE_VERSION",
        "msg": {
          "controlIndex" : newControlIndex,
          "timestampIndex" : latestControlMessage.msg.timestampIndex,
          "reference" : reference
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
     
  return util.verify(publicKey, message.signature, util.getSignatureFragment(message));
}
