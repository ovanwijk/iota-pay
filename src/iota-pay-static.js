
import jrsa from 'jsrsasign';
import SeedRandom from 'seedrandom';
import * as CryptoJS from 'crypto-js';
import IotaCrypto from 'iota.crypto.js';
import IOTA from 'iota.lib.js';
import { instantiateSecp256k1, hexToBin, instantiateSha256 } from 'bitcoin-ts';


//Easy helper for making hexbased strings
String.prototype.hexEncode = function(){
    var hex, i;

    var result = "";
    for (i=0; i<this.length; i++) {
        hex = this.charCodeAt(i).toString(16);
        result += hex
    }

    return result
}

//Fast webassembly based hashing
var _localSha256 = null;
instantiateSha256().then(result => {
    _localSha256 = result;
})
var _localSecp256k1 = null;
instantiateSecp256k1().then(verifier => {
    _localSecp256k1 = verifier;
});


//Basic api to expose utils etc
export const staticIOTA = new IOTA({
    provider: "static"
})
//Could be combined into 1 function but like to keep them similar.
//I didn't roll my own implementation here.

//Copy from: https://github.com/iotaledger/mam.client.js/blob/4f56f8fed3e22df528760156226ec4d8dcba5f8d/src/index.js#L265
function hash81 (data, rounds) {    
    return IotaCrypto.converter.trytes(
        hash(
            rounds || 81,
            IotaCrypto.converter.trits(data.slice())
        ).slice()
    );
}

//Hashing functions that end up as 81xA-Z9 
//Copy from: https://github.com/iotaledger/mam.client.js/blob/4f56f8fed3e22df528760156226ec4d8dcba5f8d/src/encryption.js#L22
export function hash(rounds, ...keys) {
    const curl = new IotaCrypto.curl(rounds)
    const key = new Int32Array(243)
    curl.initialize()
    keys.map(k => curl.absorb(k, 0, k.length))
    curl.squeeze(key, 0, 243)
    return key
}

export function hashTrytes(trytes) {    
    return hash81(trytes, 81);
}

export function isTrytes(str) {
    var regexTrytes = new RegExp("^[9A-Z]{0,}$");
    return  regexTrytes.test(str);
}

export function generateOffspringSeed(originSeed, channelName, offspringIndex) {
    //If trytes don't do anything otherwise make trytes out of it.
    return hashTrytes(isTrytes(originSeed) ? originSeed: IotaCrypto.utils.toTrytes(originSeed) +
                      IotaCrypto.utils.toTrytes(channelName) + 
                      IotaCrypto.utils.toTrytes(offspringIndex.toString()));
}

export function generateOffspringReference(offspringSeed, channelName) {
    return hashTrytes(offspringSeed +
                      IotaCrypto.utils.toTrytes(channelName));
}

/**
 * Takes the signature of the originMessage and hashes it to 81 trytes and prepends
 * IOTAPAY000 to it.
 * @param {*} originMessage 
 */
export function getIOTAPayReference(originMessage){
    return "IOTAPAY000" + hashTrytes(IotaCrypto.utils.toTrytes(originMessage.signature));
}


/**
 * Function that signs with a password protected private key
 * @param {*} privatePEM 
 * @param {*} password password in case of an encrypted key, use null if not needed
 * @param {*} toSign 
 */
export function sign(privatePEM, password, toSign) {
    var sig = new jrsa.KJUR.crypto.Signature({"alg": "SHA256withECDSA"});
    sig.init(privatePEM, password);
    sig.updateString(toSign);    
    return sig.sign();
}


/**
 * Function that signs with a password protected private key, 
 * @param {*} privatePEM 
 * @param {*} password password in case of an encrypted key, use null if not needed
 * @param {*} toSign 
 */
export function consistentSign(privatePEM, password, toSign) {
    var oldNextBytes = jrsa.SecureRandom.prototype.nextBytes;
   
    //For consistent signing we take the SHA512 value of the data to sign
    //as seed for the random generator.
    var seededRandom = new SeedRandom(CryptoJS.SHA512(toSign));        
     //create a new nextBytes function based on a SeedRandom method
    var SeededRandomNextBytes = function(ba) {           
        for (var i = 0; i < ba.length; i++) {
                ba[i] = Math.floor(seededRandom() * 256); // make it bytes.
            }
    }
    jrsa.SecureRandom.prototype.nextBytes = SeededRandomNextBytes;
 
    var sigToReturn = sign(privatePEM, password, toSign);
    jrsa.SecureRandom.prototype.nextBytes = oldNextBytes;
    
    return sigToReturn;
}
//Verification function using bitcoin-ts with webassembly
export function fastVerify(signature, toVerify){
    var textBin = hexToBin(toVerify.hexEncode());
    var sigBin = hexToBin(signature);
    var hashBin = _localSha256.hash(textBin);
   
    var result = _localSecp256k1.verifySignatureDER(sigBin, _pubKeyByteArray, hashBin);
    return result;
}

var _pubKeyCache = null;
var _pubKeyByteArray = null;

/**
 * Uses a public PEM to verify the signature
 * @param {*} publicPEM 
 * @param {*} signature 
 * @param {*} toVerify 
 */
export function verify(publicPEM, signature, toVerify) {
    if(_pubKeyCache != publicPEM){
        _pubKeyCache = publicPEM;
        _pubKeyByteArray = hexToBin(jrsa.KEYUTIL.getKey(publicPEM).pubKeyHex);
    }
    return fastVerify(signature, toVerify);
    //Old code was slow required reparsing of the key everytime.
    // var sig = new jrsa.KJUR.crypto.Signature({"alg": "SHA256withECDSA"});
    // sig.init(publicPEM);
    // sig.updateString(toVerify);
    // var verified = sig.verify(signature);    
    // return verified;    
}

/**
 * takes the msg fragment of a message and deletes the excluded fields to make up the message fragment in base64
 * @param {*} message 
 */
export function getSignatureFragment(message){
    var toUse = message.msg;    
    if(message.excludeFromSignature){
        toUse = Object.assign({}, message.msg);
        Object.keys(message.excludeFromSignature).forEach(excluded => {
            delete toUse[excluded];
        });
    }
    return Buffer.from(JSON.stringify(toUse)).toString("base64");
}

/**
 * Generates a key pair based on the SHA512 has of the input
 * @param {*} originSeed the seed used for the seeded ECDSA, does not need to conform to a IOTA Seed
 */
export async function generateECDSAKeyPairFromSeed(originSeed) {
    
    //This method is here to replace the SecureRandom generator native to jsrasign with
    //a seeded version. They both use prng random numbers.

    //seed the prng random generator   
    var seededRandom = new SeedRandom(CryptoJS.SHA512(originSeed).toString());

    //save the original random generator.
    var oldNextBytes = jrsa.SecureRandom.prototype.nextBytes;

    //create a new nextBytes function based on a SeedRandom method
    var SeededRandomNextBytes = function(ba) {
        var i;        
        for (i = 0; i < ba.length; i++) {
            ba[i] = Math.floor(seededRandom() * 256); // make it bytes.
        }
    }

    //Replace the random function
    jrsa.SecureRandom.prototype.nextBytes = SeededRandomNextBytes;

    var ecKeypair = jrsa.KEYUTIL.generateKeypair("EC", "secp256k1");     
  
    //just put back the old random function after generation.
    jrsa.SecureRandom.prototype.nextBytes = oldNextBytes;
    // debugger;
    // var jwkPrivate = jrsa.KEYUTIL.getJWKFromKey(ecKeypair.prvKeyObj);
    // var jwkPublic = jrsa.KEYUTIL.getJWKFromKey(ecKeypair.prvKeyObj);
    // debugger;
    return {
        privateKey: jrsa.KEYUTIL.getPEM(ecKeypair.prvKeyObj, "PKCS8PRV"),
        publicKey: jrsa.KEYUTIL.getPEM(ecKeypair.pubKeyObj)
    };;

}
