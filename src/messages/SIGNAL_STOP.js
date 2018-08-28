
import * as util from '../iota-pay-static';
import * as schemaValition from '../schema-validation';


export function generateMessage(address, privateKeyPEM, pemPassword = null) {
    
    var toReturn = {
        "msgType": "SIGNAL_STOP",
        "msg" : {
          "signal" : "SIGNAL_STOP",
          "address": address
        }      
      }
      toReturn.signature = util.sign(privateKeyPEM, pemPassword, util.getSignatureFragment(toReturn));
      debugger;
      if(schemaValition.validate(toReturn)){
          return toReturn;
      }else{
          throw schemaValition.getErrors();
      }
}

export function verifySignature(message, publicKey) {
    
    return util.verify(publicKey, message.signature,  util.getSignatureFragment(message));
}
