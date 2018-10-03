
import * as util from '../iota-pay-static';
import * as schemaValidation from '../schema-validation';


export function generateMessage(privateKeyPEM, pemPassword = null) {
  
    var toReturn = {
        "msgType": "TERMINATE",
        "msg" : {
          "signal" : "TERMINATE"
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
    
    return util.verify(publicKey, message.signature,  util.getSignatureFragment(message));
}
