
import * as util from '../iota-pay-static';
import * as schemaValidation from '../schema-validation';
/**
 * 
 * @param {*} channelName 
 * @param {*} publicKeyPEM 
 * @param {*} version 
 * @param {*} privateKeyPEM 
 * @param {*} pemPassword 
 */
export function generateMessage(channelName, publicKeyPEM, version, privateKeyPEM, pemPassword = null, timestamp = null) {
    //sign(msgType + channelName + publicKey + version + controlIndex)
    if(timestamp === null){
        timestamp = Date.now();
    }   
    var toReturn = {
        "msgType": "ORIGIN",
        "msg" : {
          "channelName" : channelName,
          "version" : version,
          "method" : "ECDSA-SHA256",
          "publicKey" : publicKeyPEM,      
          "controlIndex" : 0,
          "timestampIndex" : timestamp
        },
        "excludeFromSignature": {
            "timestampIndex": true
        }    
      }
      //The only place where we really want to use consistent signatures.
      toReturn.signature = util.consistentSign(privateKeyPEM, pemPassword, util.getSignatureFragment(toReturn));   
     
      if(schemaValidation.validate(toReturn)){
          return toReturn;
      }else{
          throw schemaValidation.getErrors();
      }
}

export function verifySignature(message, publicKey) {
  
    return util.verify(publicKey, message.signature, util.getSignatureFragment(message));
}
