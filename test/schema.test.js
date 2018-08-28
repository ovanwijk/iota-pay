var assert = require('assert');
var iotaPay = require('../dist/iota-pay-api');




var COM_CONTROL = {
    "msgType": "COM_CONTROL",
    "msg" : {
      "controlIndex" : 1,
      "timestampIndex" : 1530597308398,
      "visuals" : {            
          "always" : {
              "name" : "Name to display",
              "email" : "address@mailserver.com",
              "website" : "http://iota.org"
          },            
          "onError" : {
              "email" : "iota_pay_error@mailserver.com"
          }
      },
      "iotaNodes" : {
          "initNodes" : ["AUTO1"],
          "transactionNodes" : ["http://iota.org:443", "AUTO3"]
      }
    },
    "signature": ""
  }

var PAYMENT_CHANNEL = {
    "msgType": "PAYMENT_CHANNEL",
    "msg": {
      "controlIndex" : 1,
      "timestampIndex" : 1530597308398,
      "offspringIndex" : 0,        
      "offspringReference" : "TEST9999999999TEST999TEST999TEST999TEST999TEST999TEST9999999999999999999999999999",
      "validations" : [{
          "method" : "TEST",
          "arguments" : ["s", 1, true]
      }],
    },
    "signature": ""
  }

var ORIGIN = {
    "msgType": "ORIGIN",
    "msg" : {
      "channelName" : "IOTAPAY",
      "version" : 1,
      "method" : "ESDCA-SHA256",
      "publicKey" : "ESDCA Public key",      
      "controlIndex" : 0,
      "timestampIndex" : 1530597308398
    },    
        "excludeFromSignature": {
            "timestampIndex": true
        },
    "signature" : "ESDCA signature"
  }
var UPGRADE_VERSION = {
    "msgType": "UPGRADE_VERSION",
    "msg":  {
          "controlIndex" : 1,
          "timestampIndex" : 1530597308398,
          "reference" : "IOTAPAY000TEST9999999999TEST999TEST999TEST999TEST999TEST999TEST9999999999999999999999999999"
    },
    "signature": ""
  }

  var SIGNAL_STOP = {       
    "msgType": "SIGNAL_STOP", 
    "msg": {
        "signal": "SIGNAL_STOP",
        "address": "TEST9999999999TEST999TEST999TEST999TEST999TEST999TEST9999999999999999999999999999"
    },     
    "signature": ""
  }
  var TERMINATE = {       
    "msgType": "TERMINATE",  
    "msg": {
        "signal": "TERMINATE"
    },    
    "signature": ""
  }


describe("Schema's", function(done) {

    it('No msgTYPE', function() {
        
        var isValid = iotaPay.SchemaValidation.validate({
            test: "hi"
        });
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, false);
       
    });

    it('No json object', function() {
        
        var isValid = iotaPay.SchemaValidation.validate("just a string here");
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, false);
       
    });

    it('Invalid msgTYPE', function() {
       
        var isValid = iotaPay.SchemaValidation.validate({
            msgType : "INVALID"
        });
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, false);
       
    });

    it('TERMINATE', function() {
        var isValid = iotaPay.SchemaValidation.validate(TERMINATE);
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, true);
       
    });

    
    it('SIGNAL_STOP', function() {
        var isValid = iotaPay.SchemaValidation.validate(SIGNAL_STOP);
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, true);
       
    });

    it('UPGRADE_VERSION', function() {
        var isValid = iotaPay.SchemaValidation.validate(UPGRADE_VERSION);
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, true);
       
    });


    it('ORIGIN', function() {
        var isValid = iotaPay.SchemaValidation.validate(ORIGIN);
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, true);
       
    });

    it('PAYMENT_CHANNEL', function() {
        var isValid = iotaPay.SchemaValidation.validate(PAYMENT_CHANNEL);
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, true);
       
    });

    it('COM_CONTROL', function() {
        var isValid = iotaPay.SchemaValidation.validate(COM_CONTROL);
        
        if(!isValid){
            console.log("Errors:", iotaPay.SchemaValidation.getErrors());
        }
        assert.equal(isValid, true);
       
    });
});