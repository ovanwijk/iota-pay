var assert = require('assert');

var iotaPay = require('../dist/iota-pay-api');

//Tests timing out? Increase this.
var testTimeOut = 2000;

describe('EventCodes', function(done) {
    it('should not contain duplicate EventCodes', function() {    
        var codes = iotaPay.EventCodes;
        var rMap = {};
        for(var prop in codes){
            assert.equal(rMap[codes[prop]], undefined);
            rMap[codes[prop]] = prop;
        }
    });
})




describe('ECDSA signature validations', function() {
    //Tests to make sure the deterministic nature of key generation stays deterministic.

    var testSeed = "IOTAPAYTESTSEED999999999999999999999999999999999999999999999999999999999999999999";
    var oldPublicKey = '-----BEGIN PUBLIC KEY-----\r\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0M0u23uVI9zVJBMm8Ino1M7lH1P9\r\nvhmcmmxPGlEhw8LKrWvj9KQ2HEYFnPcBZFVPxYxfEOnWeFpQSIMKxBx6pQ==\r\n-----END PUBLIC KEY-----\r\n';
   // var oldPublicKey = '-----BEGIN PUBLIC KEY-----\r\nMFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEmYDy+2wAzX50qeWRO4Z+h6R3eREDod13\r\nxFHcfEoCJt1A/EjtakHPFboGfYhrE4IykoEYVvhcHt6+OGul5zyEXg==\r\n-----END PUBLIC KEY-----\r\n';
  
    var utils = iotaPay.IotaPayUtil;
    var message = iotaPay.MessageFunctions;

    //var testSeedBasedIOTAPAYReference = "IOTAPAY000DNDVTRXXFBCEPRFRKELPEHZRCWXKTHLTUAYLEOVARB9ISWRCBNZUL9NJWDTMCBMAUSDVEBQWRRQTHKHJO";
    var testSeedBasedIOTAPAYReference = "IOTAPAY000GBWIZG9CHCCUPAGNJFNUISOYGXTEZCFLXTBAX9TYGHMXYZSF9GWTPBEBYGMBQQGDMVIFMMLXXHXXATRFH";

    var previousControlMessage = {
        controlIndex: 1,
        timestampIndex: 15000000
    }

    let keyPair;
    let newSignature;
    let signedORIGINMessage;
    let signedPAYMENT_CHANNELMessage;
    let signedCOM_CONTROLMessage;
    let signedUPGRADE_VERSIONMessage;
    let signedTERMINATEMessage;
    let signedSIGNAL_STOPMessage;
    let signedADD_LISTMessage;

    before(async () => {
        this.timeout(testTimeOut);
        keyPair = await utils.generateECDSAKeyPairFromSeed(testSeed);
    });

    it('should generate and sign ORIGIN message', function(){
        this.timeout(testTimeOut);
        //Magic number 1 is the version.
        signedORIGINMessage = message.ORIGIN.generateMessage("IOTAPAY", keyPair.publicKey, 1, keyPair.privateKey);       
        assert.equal(message.ORIGIN.verifySignature(signedORIGINMessage, keyPair.publicKey), true);       
    });

    it('validate 500 signatures', function(){
        this.timeout(100000000);
        //Magic number 1 is the version.
         assert.equal(message.ORIGIN.verifySignature(signedORIGINMessage, keyPair.publicKey), true);       
    });
    
    it('should NOT pass ORIGIN message validation with a wrong public key', function(){  
        this.timeout(testTimeOut);
        assert.equal(message.ORIGIN.verifySignature(signedORIGINMessage, oldPublicKey), false);
    });

    it('should generate the correct IOTAPAY Reference', function(){
        this.timeout(testTimeOut);
        var generatedIotaPayReference = utils.getIOTAPayReference(signedORIGINMessage);
        assert.equal(generatedIotaPayReference, testSeedBasedIOTAPAYReference);
    });

    it('should generate and validate PAYMENT_CHANNEL', function(){
        this.timeout(testTimeOut);
        signedPAYMENT_CHANNELMessage = 
            message.PAYMENT_CHANNEL.generateMessage(
                signedORIGINMessage,
                signedORIGINMessage.msg.channelName,
                2, //OffspringIndex
                [ //Validation methods
                    message.PAYMENT_CHANNEL.generateValidationMethod("SIGNAL_STOP", ["https://manualnode.net:443"]),
                    message.PAYMENT_CHANNEL.generateValidationMethod("MAX_FUNDS", [100000, ["https://manualnode.net:443"]])
                ],
                testSeed,
                keyPair.privateKey
            );

        assert.equal(message.PAYMENT_CHANNEL.verifySignature(signedPAYMENT_CHANNELMessage, keyPair.publicKey), true); 
    });

    it('should NOT pass PAYMENT_CHANNEL message validation with a wrong public key', function(){ 
        this.timeout(testTimeOut); 
        assert.equal(message.PAYMENT_CHANNEL.verifySignature(signedPAYMENT_CHANNELMessage, oldPublicKey), false);
    });
            
    it('should generate and validate COM_CONTROL', function(){
        this.timeout(testTimeOut);
        signedCOM_CONTROLMessage = message.COM_CONTROL.generateMessage(
            signedPAYMENT_CHANNELMessage,
            { //Visuals
                always: {
                    email: "haaaaai@iota.org",
                    website: "iotapay.com"
                },
                onError: {
                    email: "contactMeHere@yep.com"
                }
            },
            {//Node configuration.
                initNodes: [
                    "AUTO1",
                    "https://manualnode.net:443"
                ],
                transactionNodes: [
                    "AUTO3"
                ]
            },
            keyPair.privateKey
        );
        assert.equal(message.COM_CONTROL.verifySignature(signedCOM_CONTROLMessage, keyPair.publicKey), true);
    });

    it('should NOT pass signedCOM_CONTROLMessage message validation with a wrong public key', function(){
        this.timeout(testTimeOut);  
        assert.equal(message.COM_CONTROL.verifySignature(signedCOM_CONTROLMessage, oldPublicKey), false);
    });

    it('should generate and validate UPGRADE_VERSION', function(){
        this.timeout(testTimeOut);
        signedUPGRADE_VERSIONMessage = message.UPGRADE_VERSION.generateMessage(
            signedCOM_CONTROLMessage,
            "IOTAPAY000" + utils.hashTrytes("RANDOMRSTUFF"),
            keyPair.privateKey
        )
        assert.equal(message.UPGRADE_VERSION.verifySignature(signedUPGRADE_VERSIONMessage, keyPair.publicKey), true);
    });

    it('should NOT pass signedUPGRADE_VERSIONMessage message validation with a wrong public key', function(){
        this.timeout(testTimeOut);  
        assert.equal(message.UPGRADE_VERSION.verifySignature(signedUPGRADE_VERSIONMessage, oldPublicKey), false);
    });

    it('should generate and validate ADD_LIST', function(){
        this.timeout(testTimeOut);
        signedADD_LISTMessage = message.ADD_LIST.generateMessage(
            signedPAYMENT_CHANNELMessage,
            [ //Address list
                {a: utils.hashTrytes("AAA"), i : 0},
                {a: utils.hashTrytes("BBB"), i : 1},
                {a: utils.hashTrytes("CCC"), i : 2},
                {a: utils.hashTrytes("DDD"), i : 3}
            ],
            keyPair.privateKey
        )
        assert.equal(message.ADD_LIST.verifySignature(signedADD_LISTMessage, keyPair.publicKey), true);
    });

    it('should NOT pass signedADD_LISTMessage message validation with a wrong public key', function(){  
        assert.equal(message.ADD_LIST.verifySignature(signedADD_LISTMessage, oldPublicKey), false);
    });


    it('should generate and validate TERMINATE', function(){
        this.timeout(testTimeOut);
        signedTERMINATEMessage = message.TERMINATE.generateMessage(          
            keyPair.privateKey
        )
        assert.equal(message.TERMINATE.verifySignature(signedTERMINATEMessage, keyPair.publicKey), true);
    });

    it('should NOT pass signedTERMINATEMessage message validation with a wrong public key', function(){ 
        this.timeout(testTimeOut); 
        assert.equal(message.TERMINATE.verifySignature(signedTERMINATEMessage, oldPublicKey), false);
    });

    
    it('should generate and validate SIGNAL_STOP', function(){
        this.timeout(testTimeOut);
        signedSIGNAL_STOPMessage = message.SIGNAL_STOP.generateMessage(
            "TEST9999999999TEST999TEST999TEST999TEST999TEST999TEST9999999999999999999999999999",        
            keyPair.privateKey
        )
        assert.equal(message.SIGNAL_STOP.verifySignature(signedSIGNAL_STOPMessage, keyPair.publicKey), true);
    });

    it('should NOT pass signedSIGNAL_STOPMessage message validation with a wrong public key', function(){
        this.timeout(testTimeOut);  
        assert.equal(message.SIGNAL_STOP.verifySignature(signedSIGNAL_STOPMessage, oldPublicKey), false);
    });


})

