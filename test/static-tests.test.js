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


describe('ECDSA deterministic keys', function() {
    //Tests to make sure the deterministic nature of key generation stays deterministic.

    var testSeed = "IOTAPAYTESTSEED999999999999999999999999999999999999999999999999999999999999999999";
    //var oldPublicKey = '-----BEGIN PUBLIC KEY-----\r\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0M0u23uVI9zVJBMm8Ino1M7lH1P9\r\nvhmcmmxPGlEhw8LKrWvj9KQ2HEYFnPcBZFVPxYxfEOnWeFpQSIMKxBx6pQ==\r\n-----END PUBLIC KEY-----\r\n';
    var oldPublicKey = '-----BEGIN PUBLIC KEY-----\r\nMFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEmYDy+2wAzX50qeWRO4Z+h6R3eREDod13\r\nxFHcfEoCJt1A/EjtakHPFboGfYhrE4IykoEYVvhcHt6+OGul5zyEXg==\r\n-----END PUBLIC KEY-----\r\n';
  
    var signatureInfo = "testing private key signature";
    //var oldSignature = "3045022064ce3cbfab04119a35b4edfbf638bf0e4312e544ccfa4bf441367f1417d7ae22022100d5f8196e8479082242516464bbb2f4c6afc3eb58e7fcaeeef5fdb18f648bc0a6";
    var oldSignature = "3045022100ba675980a627afb32b6b19950e61ca97c4198f2232ba7565c3e646fb5d2dfa4c02202c6e169b25101854d2222bb12834f7feb2cdb834054ebe739895c4732039d38b";
   
    var utils = iotaPay.IotaPayUtil;

    let keyPair;
    let newSignature;
    
    before(async () => {
        this.timeout(testTimeOut);
        keyPair = await utils.generateECDSAKeyPairFromSeed(testSeed);
        newSignature = utils.sign(keyPair.privateKey, null, signatureInfo);
    });

    it('Generate correct IOTA seeds: tryte-based', function() {
        var localSeed = testSeed;
        assert.equal('CDTLFVMHUPZRYRPGWRRANJHUCKPCESBVL9NQJKDEXWLIU9EMKVS9CPPSX9E9QETMKVDAS9IEMBRKVARTV', 
            utils.generateOffspringSeed(localSeed, 'IOTAPAY', 0));
        assert.equal('GXVO99EMCZAVWPRWTR9GXKIWEWIWADTREPJBKOQAXBMBGCBJBAGJRZSSWPBI9EHVBZLKYOVTQXQKJASVK',
             utils.generateOffspringSeed(localSeed, 'IOTAPAY', 1));
    });

    it('Generate correct IOTA seeds: non-tryte-based', function() {
        var localSeed = testSeed + "randomNonTrytes";
        assert.equal('YCNB9VTVMSYGHXOAFJVUZKVWOVYBMOTLFCMTBVJVFSXVFJZTTFDQRURUPK9CVLJULQSUXMIUUGCOOOONU', 
            utils.generateOffspringSeed(localSeed, 'IOTAPAY', 0));
        assert.equal('YJQWLDSU9JKXEZD9UASCBPIQWACQDPXNUVGRJ9FUHZCDSPBSBCKZYEQKMKDLDQMRHCELGTUTGZ9J9ISNI',
             utils.generateOffspringSeed(localSeed, 'IOTAPAY', 1));
    });
    

    it('Faulty seed generator generates same seed', function() {
        //AAAA...AAAA seed was used to find the problem
        var localSeed = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        assert.equal('XAL9SMWRVVMYNSIIUVHXH9LBAHYHUWXRRKOTWECQULPRVVHMJXIIHAKPMZZGUFQPJNNAWBRUMZMRLFXNP', 
            utils.faultySeedGenerator(localSeed, 'IOTAPAY', 0));
        //The faulty generator generated the same seed over different indexes IF the origin seed was TRYTES
        assert.equal('XAL9SMWRVVMYNSIIUVHXH9LBAHYHUWXRRKOTWECQULPRVVHMJXIIHAKPMZZGUFQPJNNAWBRUMZMRLFXNP',
             utils.faultySeedGenerator(localSeed, 'IOTAPAY', 1));
    });

    //Due to the encryption procces we cannot compare the private keys directly.
    it('key similarity', function() {        
        assert.equal(keyPair.publicKey, oldPublicKey);
    });

    it('public key should validate signature', function() {
        this.timeout(testTimeOut);        
        assert.equal(utils.verify(keyPair.publicKey, newSignature, signatureInfo), true);
    });

    it('old public key should validate new signature', function() {
        this.timeout(testTimeOut);        
        assert.equal(utils.verify(oldPublicKey, newSignature, signatureInfo), true);
    });

    it('new key should validate old signature', function() {
        this.timeout(testTimeOut);        
        assert.equal(utils.verify(keyPair.publicKey, oldSignature, signatureInfo), true);
    });
});