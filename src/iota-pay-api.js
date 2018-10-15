import IOTA from 'iota.lib.js';
import EventEmitter from 'events';
import * as codes from './codes';
import * as utils from './iota-pay-static';
import { IotaMultiNode, promisifyAPI } from 'iotapublicnodeselection';

import * as SchemaValidation from './schema-validation';

import * as ORIGIN from './messages/ORIGIN';
import * as PAYMENT_CHANNEL from './messages/PAYMENT_CHANNEL';
import * as COM_CONTROL from './messages/COM_CONTROL';
import * as UPGRADE_VERSION from './messages/UPGRADE_VERSION';
import * as TERMINATE from './messages/TERMINATE';
import * as SIGNAL_STOP from './messages/SIGNAL_STOP';
import * as ADD_LIST from './messages/ADD_LIST';
import { TimeIndexedReference } from './time-indexed-reference';

var messageFunctions = {
    ORIGIN: ORIGIN,
    PAYMENT_CHANNEL: PAYMENT_CHANNEL,
    COM_CONTROL: COM_CONTROL,
    UPGRADE_VERSION: UPGRADE_VERSION,
    TERMINATE: TERMINATE,
    SIGNAL_STOP: SIGNAL_STOP,
    ADD_LIST: ADD_LIST
}


const reversedCodes = (() => {
    var toReturn = {}
    Object.keys(codes).forEach(key => {
        toReturn[codes[key]] = key;
    })
    return toReturn;
})();


const API_VERSION = 1;
const MWM = 14;
const tipDepth = 9;
const iotaUtils = utils.staticIOTA.utils;

async function getNewPrivateAPI(originSeed, channelName = "IOTAPAY", privateKeyPEM = null, publicKeyPEM = null, pemPassword = null) {
    if (privateKeyPEM === null || publicKeyPEM === null) {
        var keys = await utils.generateECDSAKeyPairFromSeed(originSeed);
        return new IotaPay(originSeed, channelName, keys.privateKey, keys.publicKey, pemPassword);
    } else {
        return new IotaPay(originSeed, channelName, privateKeyPEM, publicKeyPEM, pemPassword);
    }
}


function getNewPublicAPI(iotaPayReference) {
    var referenceRegEx = /^IOTAPAY000[A-Z9]{81}$/;   
    if(!iotaPayReference.match(referenceRegEx)){
        throw "Not a valid IOTA Pay reference" + referenceRegEx;
    }
    return new IotaPay(iotaPayReference, null, null, null, null);
    
}


/**
 * Bundling transactions based on their bundle hash.
 * @param {*} transactions 
 */
function bundleTransactions(transactions = []) {
    //TODO look for more efficient ordering on bundles, they should be small so sort of ok.
    var toReturn = {
        //BUNDLEHASH : [BundleIndexed Ordered transactions]

    }; 
    transactions.forEach(transaction => {
        if (!toReturn[transaction.bundle]) {
            toReturn[transaction.bundle] = [];
        }
        toReturn[transaction.bundle].push(transaction);
    });
    Object.keys(toReturn).forEach(bundle => {
        toReturn[bundle] = toReturn[bundle].sort((a, b) => a.currentIndex - b.currentIndex)
    })
    return toReturn;
}

/**
 * Special function that takes a promise (asyncFunction) and wraps it in a timeout
 * This is so that the UI can update before finishing the function.
 * @param {*} asyncFunction 
 */
export async function forceUIUpdate(asyncFunction){
    return new Promise(function (fulfilled, rejected) {
        setTimeout(() => {
            asyncFunction().then( result => {
                fulfilled(result)
            }).catch(error => {
                rejected(error);
            })
        }, 10);
    })    
}
class IotaPay extends EventEmitter {

    constructor(originSeedOrPublicReference, channelName = null, privateKeyPEM = null, publicKeyPEM = null, pemPassword = null) {
        super();
        //var seedRegExp = /^[A-Z9]{81}$/;
        var referenceRegEx = /^IOTAPAY000[A-Z9]{81}$/;
        this.publicMode = false;
        if(originSeedOrPublicReference.match(referenceRegEx)){
            this.publicMode = true;
        }
        //if (!this.publicMode && !originSeedOrPublicReference.match(seedRegExp)) {
       //     throw "Seed not correct";
       // }
        this.originSeed = originSeedOrPublicReference;
        this.channelName = (channelName === null) ? "IOTAPAY" : channelName;
        this.privateKeyPEM = privateKeyPEM;
        this.publicKeyPEM = publicKeyPEM;
        this.pemPassword = pemPassword;
        this.iotaMultiNode = new IotaMultiNode();
        this.initialized = false;
        this.timestampIndexedMap = {

        }
        

        this.latestTimeIndex = 0;
        this.selectedTimeIndexedObject = null;
        this.terminationMessages = [];

        //We bind them in case of a callback so they can reference [this] as an instance of EventEmitter
        this.emitInfo = this.emitInfo.bind(this);
        this.emitError = this.emitError.bind(this);
        this.emitWarning = this.emitWarning.bind(this);
        //We start by creating the basic origin message
        //so we can generate the iota pay reference from there.
        //Iota pay reference = Hash of the origin signature.
        if(this.publicMode){
            this.reference = originSeedOrPublicReference;
            this.referenceAddress = this.reference.substring(10);
        }else{
            this.generateNewOriginMessage();
        }

        //These get an array of addresses  + args
        this.candidatePickingValidations = {
            "MAX_FUNDS": this.checkBalancesValidation.bind(this),
            "HAS_OUTPUTS": this.checkAddresesSpentFromValidation.bind(this)
        }
        //these get a single address + args
        this.singleAddressValidations = {            
            "SIGNAL_STOP" : this.checkSignalStop.bind(this),
            "HAS_OUTPUTS_MULTI_NODE": this.checkSingleAddresesSpentFromValidation.bind(this),
            "MAX_INPUTS" : null,

        }
    }

    /**
     * Function used to request more private information on loaded addresses.
     * offspringReferences must be read before.
     */
    async activePaymentChannelStatistics(){
        if(this.selectedTimeIndexedObject){
            var paymentChannel = this.getPaymentChannel();
           
            if(!paymentChannel){
                this.emitError(codes.NO_PAYMENT_MESSAGE);
                return null;
            }
            
            var selectedCandidate = null;
            var lastIndex = -1;
            this.emitInfo(codes.SELECTING_CANDIDATE);
            while(selectedCandidate == null){
                selectedCandidate = await this.pickCandidate(paymentChannel.msg.validations, lastIndex);
                
                if(!selectedCandidate){
                    this.emitError(codes.NO_ADDRESS);
                    break;
                }
                this.emitInfo(codes.POTENTIAL_ADDRESS_SELECTED, selectedCandidate);
                lastIndex = selectedCandidate.i;

                await this.executeAddressValidation(selectedCandidate, paymentChannel.msg.validations);
                if(selectedCandidate.isCandidate()){
                    this.emitInfo(codes.ADDRESS_SELECTED, selectedCandidate);
                    break;
                }
                selectedCandidate = null;
            }
        
            var activeAddresses = this.selectedTimeIndexedObject.getActiveAddresses();
            var availableAddresses = 0;
            var totalBalance = 0;
           
            var positiveBalanceAddresses = [];
            //var offspringIndex = paymentChannel.msg.offspringIndex;
            for(var i = 0; i < activeAddresses.length; i++){
                if(activeAddresses[i].isSpentFrom == false && activeAddresses[i].isCandidate()){
                    availableAddresses += 1;
                }
                if(activeAddresses[i].balance > 0){
                    totalBalance += activeAddresses[i].balance;
                    positiveBalanceAddresses.push(activeAddresses[i]);
                }
            }
        return {
            totalAddresses: activeAddresses.length,
            activeAddresses: activeAddresses,
            availableAddresses: availableAddresses,
            totalBalance: totalBalance,
            offspringSeeds: this.getOffspringSeeds(),
            wronglyGeneratedSeed: utils.faultySeedGenerator(this.originSeed),
            activeOffspringIndex: paymentChannel.msg.offspringIndex,
            offspringReference: paymentChannel.msg.offspringReference,
            positiveBalanceAddresses: positiveBalanceAddresses,
            exposedAddress: selectedCandidate
            
        }




        }else{
            this.emitError(codes.NO_ORIGIN_MESSAGE);
            return null;
        }
    }


    /**
     * Returns the publically exposed address
     */
    async getPublicAddress(){
        var paymentChannel = null;
        var comControl = null;
        if(this.publicMode){
            if(!(await this.readReference())){
                return null;
            }
            
            paymentChannel = this.getPaymentChannel();
            comControl = this.getComControl();
            if(!paymentChannel){
                this.emitError(codes.NO_PAYMENT_MESSAGE);
                return null;
            }
            if(!comControl){
                this.emitError(codes.NO_COM_MESSAGE);
                return null;
            }
            
            await this.readOffspringReference(paymentChannel.msg.offspringReference);
        }
        if(this.selectedTimeIndexedObject){
            paymentChannel = this.getPaymentChannel();
            comControl = this.getComControl();
            if(!paymentChannel){
                this.emitError(codes.NO_PAYMENT_MESSAGE);
                return null;
            }
            if(!comControl){
                this.emitError(codes.NO_COM_MESSAGE);
                return null;
            }
            var selectedCandidate = null;
            var lastIndex = -1;
            this.emitInfo(codes.SELECTING_CANDIDATE);
            while(selectedCandidate == null){
                selectedCandidate = await this.pickCandidate(paymentChannel.msg.validations, lastIndex);
                
                if(!selectedCandidate){
                    this.emitError(codes.NO_ADDRESS);
                    return null;
                }
                this.emitInfo(codes.POTENTIAL_ADDRESS_SELECTED, selectedCandidate);
                lastIndex = selectedCandidate.i;

                await this.executeAddressValidation(selectedCandidate, paymentChannel.msg.validations);
                if(selectedCandidate.isCandidate()){
                    this.emitInfo(codes.ADDRESS_SELECTED, selectedCandidate);
                    return selectedCandidate;
                }
                selectedCandidate = null;
            }
        }else{
            this.emitError(codes.NO_ORIGIN_MESSAGE);
            return null;
        }
    }



    //------------ validations ------------------

    /**
     * picks a candidate, can be called recursively
     * if excludeIndex is -1 then the group validations are called
     * if validating a single address fails increase the exclude index to the failing index
     * @param {*} validations 
     * @param {*} excludeIndex 
     */
    async pickCandidate(validations, excludeIndex = -1) {
        if(excludeIndex == -1){
            await this.executeGroupValidations(validations);
        }
        var addressList = this.selectedTimeIndexedObject.getActiveAddresses();
        var candidate = null;
        for(var i = 0; i < addressList.length; i++){
            if(addressList[i].i > excludeIndex && addressList[i].isCandidate()){
                candidate = addressList[i];
                break;
            }
        }
        return candidate;
    }

    /**
     * Execute this function every x time in order to validate if an address is still valid.
     * @param {*} addressObject 
     * @param {*} validations 
     */
    async executeAddressValidation(addressObject, validations){
        var hasSignalStopValidation = false;
        var hasOutputCheck = false;
        
        validations.forEach(validation => {
            if(validation.method == "SIGNAL_STOP"){
                hasSignalStopValidation = true;                
            }
            if(validation.method == "HAS_OUTPUTS_MULTI_NODE"){
                hasOutputCheck = true;                
            }
        })
        //Making sure multiple important validation are done.
        if(!hasSignalStopValidation){
            validations.push({
                method: "SIGNAL_STOP",
                args: [["AUTO3"]]
            })
        }

        if(!hasOutputCheck){
            validations.push({
                method: "HAS_OUTPUTS_MULTI_NODE",
                args: [["AUTO3"]]
            })
        }
        this.emitInfo(codes.START_VALIDATION, addressObject);
        for(var i =0; i < validations.length;i++){
            var validationMethod = this.singleAddressValidations[validations[i].method];          
            if(validationMethod){
                await validationMethod(validations[i].method, addressObject, ...validations[i].args);
            }
        }
    }

    /**
     * Executing group validations for selecting candiates.
     * These are the functions that execute on the group level of the IOTA Api
     * @param {*} validations 
     */
    async executeGroupValidations(validations) {

        var hasOutputsValidation = false;
        validations.forEach(validation => {
            if(validation.method == "HAS_OUTPUTS"){
                hasOutputsValidation = true;                
            }
        })
        if(!hasOutputsValidation){
            validations.push({
                method: "HAS_OUTPUTS",
                args: [["AUTO3"]]
            })
            //MAX_FUNDS
            validations.push({
                method: "MAX_FUNDS",
                args: [["AUTO3"], 999999999999999]
            })
        }
        var addressList = this.selectedTimeIndexedObject.getActiveAddresses();
        for(var i = 0; i < validations.length;i++){
            var validationMethod = this.candidatePickingValidations[validations[i].method];
            if(validationMethod){
                await validationMethod(validations[i].method, addressList, ...validations[i].args);
            }
        }
    }

    async checkSingleAddresesSpentFromValidation(method, addressObject, servers){
        await this.wereAddressesSpentFrom([addressObject], servers);
        
        addressObject.validations[method] = !addressObject.isSpentFrom;
        
    }



    async checkSignalStop(method, addressObject, servers){
        //todo make a little less cryptic with results everywhere
       
        await this.fillNodesConditions(servers);
       
        var result = await this.iotaMultiNode.findTransactionsObjectsPromise( { addresses: [addressObject.a] }, servers.length);
        
        addressObject.validations[method] = true;
        if(result.combinedTransactions){            
                var bundles = bundleTransactions(result.combinedTransactions);                
                Object.keys(bundles).forEach(bundle => {
                    var json = iotaUtils.extractJson(bundles[bundle]);
                    if (json) {
                        var parsedJson = JSON.parse(json);
                        if (parsedJson && parsedJson.msgType && parsedJson.msgType == "SIGNAL_STOP" && parsedJson.msg.address == addressObject.a &&  SchemaValidation.validate(parsedJson)) {
                            
                            if(messageFunctions.SIGNAL_STOP.verifySignature(parsedJson, this.selectedTimeIndexedObject.getPublicKey())){
                                addressObject.validations[method] = false;
                                return false;
                            }else{
                                //TODO Notify wrong signature somehow
                            }
                        }
                    }
                });
            
        }
        return true;
    }

    async checkAddresesSpentFromValidation(method, addressList, servers){
        await this.wereAddressesSpentFrom(addressList, servers);
        for(var i = 0; i < addressList.length; i++){
            addressList[i].validations[method] = !addressList[i].isSpentFrom;
        }
    }


    async wereAddressesSpentFrom(addressList, servers){
       
        await this.fillNodesConditions(servers);
        var addresses = addressList.map(address => {
            return address.a;
        });
        var result = await this.iotaMultiNode.wereAddressesSpentFromPromise(addresses, this.nodeCounting(servers));
        for(var i = 0; i < addressList.length; i++){
            addressList[i].isSpentFrom = result.combinedResult[i];
        }
    }


    async checkBalancesValidation(method, addressList, servers, maxBalance){
        await this.getBalances(addressList, servers);
        for(var i = 0; i < addressList.length; i++){
            addressList[i].validations[method] = addressList[i].balance < maxBalance;
        }
    }

    async getBalances(addressList, servers){
       
        await this.fillNodesConditions(servers);
        var addresses = addressList.map(address => {
            return address.a;
        });
        var result = await this.iotaMultiNode.getBalancesFromPromise(addresses, this.nodeCounting(servers));
        for(var i = 0; i < addressList.length; i++){
                 
                addressList[i].balance = result.combinedResult[i];
                //addressList[i].validations[method] = !addressList[i].isSpentFrom;
            
        }
    }

    nodeCounting(servers){
        var total = 0;        
        servers.forEach(server => {
            if (server.startsWith("AUTO")) {
                total += Number(server.substring(4));
            } else {
                total += 1;
            }
        });
        return total;
    }

    /**
     * Given a list of servers check if it can get the given servers.
     * If not it will initialize them in the MultiNode interface.
     * @param {*} servers 
     */
    async fillNodesConditions(servers){
        var total = 0;
        var filteredServers = [];
        servers.forEach(server => {
            if (server.startsWith("AUTO")) {
                total += Number(server.substring(4));
            } else {
                filteredServers.push(server);
            }
        });
        if(filteredServers.length === 0 && total === 0){
            total = 1;
        }
        //Checks if the servers hint already exists in the multi node.
        //if not add to hints.
        
        filteredServers = filteredServers.filter(server => !this.iotaMultiNode.transactionServerHints.includes(server))
        if(filteredServers.length > 0){
            await this.iotaMultiNode.setHintedServers(
                this.iotaMultiNode.fetchServerHints,
                this.iotaMultiNode.transactionServerHints.concat(filteredServers),
                this.iotaMultiNode.powServerHints
            )
        }

        if(total > 0){
            var selectedServers = this.iotaMultiNode.selectTransactionServers(total);
            if(selectedServers.length !== total){
                console.log("Requesting new servers");
                await this.init(["AUTO" + total.toString]);
            }
        }
    }



    //-------------------------------------------
    generateNewOriginMessage(timestamp = null){
        this.generatedOriginMessage = ORIGIN.generateMessage(
            this.channelName, this.publicKeyPEM, API_VERSION, this.privateKeyPEM, this.pemPassword, timestamp);
        this.reference = utils.getIOTAPayReference(this.generatedOriginMessage);
        this.referenceAddress = this.reference.substring(10);
    }

    /**
     * Initializes the api by receiving information from the selected nodes.
     * By default it picks 3 nodes, however after the latest COM_CONTROL message is read 
     * the servers given here are overwritten. So best to use leave the AUTO3 default.
     * When called manually in private mode you will have to call claimReference after
     * @param {*} servers 
     */
    async init(servers = ['AUTO3'], serversPerFetch = 10) {
        //this.iotaMultiNode = new IotaMultiNode();
        var total = 0;
        var filteredServers = [];
        servers.forEach(server => {
            if (server.startsWith("AUTO")) {
                total += Number(server.substring(4));
            } else {
                filteredServers.push(server);
            }
        });
        if(total>0){
            await this.iotaMultiNode.addAutoN(total, serversPerFetch);
        }
        await this.iotaMultiNode.setHintedServers(filteredServers);
        this.emitInfo(codes.SERVERS_SELECTED, Object.keys(this.iotaMultiNode.liveServers));        
    }


    async setServersFromComControl(){
        var comControlMessage = this.getComControl();
        if(comControlMessage){
            var total = 0;
            var fetchServers = [];
            var transactionServers = [];
            comControlMessage.msg.iotaNodes.initNodes.forEach(server => {
                if (server.startsWith("AUTO")) {
                    total += Number(server.substring(4));
                } else {
                    fetchServers.push(server);
                }
            });
            comControlMessage.msg.iotaNodes.transactionNodes.forEach(server => {
                if (server.startsWith("AUTO")) {
                    total += Number(server.substring(4));
                } else {
                    fetchServers.push(server);
                }
            });
            await this.iotaMultiNode.addAutoN(total, 6);
            await this.iotaMultiNode.setHintedServers(fetchServers, transactionServers);
            
            //this.emitInfo(codes.SERVERS_SELECTED, Object.keys(this.iotaMultiNode.liveServers));
        }
    }


    //True or false
    async readReference() {
        this.emitInfo(codes.READING_REFERENCE, this.referenceAddress);
        var result = await this.iotaMultiNode.findTransactionsObjectsPromise({ addresses: [this.referenceAddress] }, 3);
        if (result.combinedTransactions.length == 0) {
            this.emitError(codes.NO_ORIGIN_MESSAGE, this.referenceAddress);
            return false;
        } else { 
            //Add all messages to the internal state
            this.setupStateFromReferenceTransactions(result.combinedTransactions);

            //Switch the state to the latest known timestamp (null)
            if(!this.switchTimestampIndex(null)){
                this.emitError(codes.NO_ORIGIN_MESSAGE, this.referenceAddress);
                return false;
            }

            //After a new comControl message is found update the preferred nodes.
            if(this.selectedTimeIndexedObject && this.selectedTimeIndexedObject.activeCOMControl === null){
                this.setServersFromComControl();
            }
            if(this.selectedTimeIndexedObject !== null){
                return true;
            }
            this.emitError(codes.NO_ORIGIN_MESSAGE, this.referenceAddress);
            return false;
        }
    }

    /**
     * Simple function that checks if the the timestampIndex already exists or not.
     * If not it creates a new object before adding.
     * @param {*} message 
     */
    addToTimestampIndexedMap(message){
        if(!this.timestampIndexedMap[message.msg.timestampIndex]){
            this.timestampIndexedMap[message.msg.timestampIndex] = new TimeIndexedReference(this.reference);
        }
        this.timestampIndexedMap[message.msg.timestampIndex].addMessage(message);
    }

    setupStateFromReferenceTransactions(transactionObjects = []) {
        var t = Date.now();
        var bundles = bundleTransactions(transactionObjects);
      
        Object.keys(bundles).forEach(bundle => {
                var json = iotaUtils.extractJson(bundles[bundle]);
              
                if (json) {
                    var parsedJson = JSON.parse(json);
                   
                    if (SchemaValidation.validate(parsedJson)) {
                        if(parsedJson.msg.timestampIndex){                           
                            this.addToTimestampIndexedMap(parsedJson); 
                                               
                        }else{
                            if(parsedJson.msgType == "TERMINATE"){
                                //TODO handle terminations
                                //NOTE directly validating signatures could heavily slow down the standard 
                                //retrieval process. The current lib is quite slow, might consider one of
                                //the faster bitcoin libraries to support signature validation.
                                terminationMessages.push(parsedJson);
                            }
                            
                        }
                    } else {
                        //Warning but just ignore, some rouge transaction shouldn't matter.
                        this.emitWarning(codes.INVALID_MESSAGESCHEMA, SchemaValidation.getErrors, json)
                    }

                } else {
                    //Warning but just ignore, some rouge transaction shouldn't matter.
                    this.emitWarning(codes.NON_JSON_TRANSACTION_FOUND, bundle)
                }
            })
        console.log("Parsin jsong take: ", Date.now() - t);
        t = Date.now();     
    }

    /**
     * Switches active timestamp, null == latest valid timestamp
     * Not needed to be used unless you want to retrieve states
     * from previous snapshots
     * @param {*} timestampIndex 
     */
    switchTimestampIndex(timestampIndex = null){
        var found = false;
        if(!timestampIndex){           
            Object.keys(this.timestampIndexedMap).sort().reverse().forEach(timeIndex => {
                if(this.timestampIndexedMap[timeIndex].getLatestOriginMessage()){
                    this.selectedTimeIndexedObject = this.timestampIndexedMap[timeIndex];
                    this.latestTimeIndex = timeIndex;
                    found = true;
                }else{
                    debugger;
                }
            })
        }else{
            debugger;
            if(this.timestampIndexedMap[timestampIndex]){
                found = true;
                this.selectedTimeIndexedObject = this.timestampIndexedMap[timestampIndex];
            }
            
            //this.latestTimeIndex = (this.timestampIndexedMap[timestampIndex]) ? timestampIndex : 0;
        }
        return found;
    }
    /**
     * Use for potential login.
     * Just does find transactions and 
     */
    async peekReference(){

    }

    /**
     * Claims the reference generated by this class.
     * If no origin message exists it will send to it the address.
     * If override = true it will generate a new origin message that will
     * be used in future 
     * @param {*} override 
     */
    async claimReference(override = false) {
        if (override == false) {
            override = !(await this.readReference());
        }else{
            //Always generate a new origin message so that calling claimReference(true) always 
            //yields an unique timestamp.
            this.generateNewOriginMessage();
        }
        if (override) {
            if (await this.canPowBeDone()) {
                this.emitInfo(codes.PREPARING_ORIGIN_MESSAGE);
                var transfer = [{
                    address: this.referenceAddress,
                    value: 0,
                    message: iotaUtils.toTrytes(JSON.stringify(this.generatedOriginMessage)),
                    tag: '9'.repeat(27)
                }];
                
                var trytes = await promisifyAPI(utils.staticIOTA, "prepareTransfers", '9'.repeat(81), transfer);
                this.emitInfo(codes.SENDING_ORIGIN_MESSAGE);
                var sendTrytesResult = await this.iotaMultiNode.sendTrytesPromise(trytes, tipDepth, MWM);
                //After sending to the Tangle update internal state
                this.addToTimestampIndexedMap(this.generatedOriginMessage);
                this.switchTimestampIndex(null);
            }else{
                this.emitError(codes.NO_POW_SERVER_AVAILABLE)
            }
        }
    }

    /**
     * Sends signal stop to the address.
     * @param {*} address 
     */
    async signalStopAddress(address){
       
        if(await this.canPowBeDone()){
          
                this.emitInfo(codes.PREPARING_SIGNAL_STOP);
                var signalStop = messageFunctions.SIGNAL_STOP.generateMessage(address, this.privateKeyPEM, this.pemPassword);
                var transfer = [{
                    address: address,
                    value: 0,
                    message: iotaUtils.toTrytes(JSON.stringify(signalStop)),
                    tag: '9'.repeat(27)
                }];
                
                var trytes = await promisifyAPI(utils.staticIOTA, "prepareTransfers", '9'.repeat(81), transfer);
                this.emitInfo(codes.SENDING_SIGNAL_STOP);
                var sendTrytesResult = await this.iotaMultiNode.sendTrytesPromise(trytes, tipDepth, MWM);
                //After sending to the Tangle update internal state
               
            
        }
    }

    /**
     * Creates a new comControl messages and sends it to the Tangle
     * @param {*} visuals 
     * @param {*} iotaNodes 
     */
    async updateComControl(visuals, iotaNodes){        
        if(await this.canPowBeDone() && this.selectedTimeIndexedObject){
            var latestControlMessage = this.selectedTimeIndexedObject.getLatestControlMessage();
            if(latestControlMessage){
                this.emitInfo(codes.PREPARING_COM_CONTROL_MESSAGE);
                var comControlMessge = messageFunctions.COM_CONTROL.generateMessage(
                    latestControlMessage, visuals, iotaNodes, this.privateKeyPEM, this.pemPassword);
                var transfer = [{
                    address: this.referenceAddress,
                    value: 0,
                    message: iotaUtils.toTrytes(JSON.stringify(comControlMessge)),
                    tag: '9'.repeat(27)
                }];
             
                var trytes = await promisifyAPI(utils.staticIOTA, "prepareTransfers", '9'.repeat(81), transfer);
                this.emitInfo(codes.SENDING_COM_CONTROL_MESSAGE);
                var sendTrytesResult = await this.iotaMultiNode.sendTrytesPromise(trytes, tipDepth, MWM);
                //After sending to the Tangle update internal state
                this.addToTimestampIndexedMap(comControlMessge);
                //update the MultiNode server with the latest nodes
                this.setServersFromComControl();
                     
            }else{
                this.emitError(codes.NO_POW_SERVER_AVAILABLE)
            }
        }
    }

    /**
     * updatesThePaymentChannel with validations and offspringIndex
     * offspring index should be supplied by local state!
     * Not each offspring index can only have 200 addresses!
     * @param {*} offspringIndex 
     * @param {*} validations 
     */
    async updatePaymentChannel(offspringIndex, validations){        
        if(await this.canPowBeDone()){
            if(this.selectedTimeIndexedObject){
                var latestControlMessage = this.selectedTimeIndexedObject.getLatestControlMessage();
                if(latestControlMessage){
                    this.emitInfo(codes.PREPARING_PAYMENT_CHANNEL_MESSAGE);
                    var paymentChannelMessage = messageFunctions.PAYMENT_CHANNEL.generateMessage(
                        latestControlMessage,
                        this.channelName,
                        offspringIndex,
                        validations,
                        this.originSeed, 
                        this.privateKeyPEM, 
                        this.pemPassword);
                    var transfer = [{
                        address: this.referenceAddress,
                        value: 0,
                        message: iotaUtils.toTrytes(JSON.stringify(paymentChannelMessage)),
                        tag: '9'.repeat(27)
                    }];
                 
                    var trytes = await promisifyAPI(utils.staticIOTA, "prepareTransfers", '9'.repeat(81), transfer);
                    this.emitInfo(codes.SENDING_PAYMENT_CHANNEL_MESSAGE);
                    var sendTrytesResult = await this.iotaMultiNode.sendTrytesPromise(trytes, tipDepth, MWM);
                    //After sending to the Tangle update internal state
                    this.addToTimestampIndexedMap(paymentChannelMessage);

                }
            }else{
                debugger;
            }
        }else{
            this.emitError(codes.NO_POW_SERVER_AVAILABLE)
        }
    }

    async addAddresses(addresses){
        if(await this.canPowBeDone()){
            var currentPaymentChannel = this.getPaymentChannel();
            if(currentPaymentChannel){           
                var offspringReference = currentPaymentChannel.msg.offspringReference;
               
                var add_listMessage = messageFunctions.ADD_LIST.generateMessage(currentPaymentChannel, addresses, this.privateKeyPEM, this.pemPassword);
                var transfer = [{
                    address: offspringReference,
                    value: 0,
                    message: iotaUtils.toTrytes(JSON.stringify(add_listMessage)),
                    tag: '9'.repeat(27)
                }];
                this.emitInfo(codes.SENDING_PAYMENT_CHANNEL_MESSAGE);
            
                var trytes = await promisifyAPI(utils.staticIOTA, "prepareTransfers",'9'.repeat(81), transfer);
               
                var sendTrytesResult = await this.iotaMultiNode.sendTrytesPromise(trytes, tipDepth, MWM);
                //After sending to the Tangle update internal state
                this.addToTimestampIndexedMap(add_listMessage);
            }else{
                debugger;
            }
        }else{
            this.emitError(codes.NO_POW_SERVER_AVAILABLE);
        }
    }


    async generateAddresses(offspringIndex, startIndex = 0, count = 50){
        this.emitInfo(codes.GENERATING_ADDRESSES);
        var offspringSeed = utils.generateOffspringSeed(this.originSeed, this.channelName, offspringIndex);
        //var offspringReference = utils.generateOffspringReference(offspringSeed, this.channelName);
        
        var addresses = [];
        while(addresses.length < count){
            
            var newAddresses = await forceUIUpdate(async function(){
              
                return await promisifyAPI(utils.staticIOTA, "getNewAddress", offspringSeed,{
                    index: startIndex + addresses.length,
                    checksum: false,
                    total: 1,
                    security: 2,
                    returnAll: true
                });
            }) 
          
            addresses.push(newAddresses[0]);
            this.emitInfo(codes.ADDRESS_GENERATED, addresses.length, count, newAddresses[0]);
        }
        this.emitInfo(codes.GENERATING_ADDRESSES_DONE);
        
        var results = [];
        for(var i = 0; i < addresses.length; i++){
            results.push({
                a: addresses[i],
                i: startIndex + i
            })
        }
       
        return results;
    }

    async generateNewAddressesOnActivePaymentChannel(N = 50){
        
        if(await this.canPowBeDone()){
            var currentPaymentChannel = this.getPaymentChannel();
            if(currentPaymentChannel){           
                var offspringReference = currentPaymentChannel.msg.offspringReference;
            
                var offspringIndex = currentPaymentChannel.msg.offspringIndex;
               // debugger;
                
                await this.readOffspringReference(offspringReference);
                var highestAddressIndex = this.timestampIndexedMap[currentPaymentChannel.msg.timestampIndex].getHighestOffspringAddressIndex(offspringIndex);
                //debugger;
               
                var addresses = await this.generateAddresses(offspringIndex, highestAddressIndex + 1, N);
               
                await this.addAddresses(addresses);
               
            }else{
                debugger;
            }
        }else{
            this.emitError(codes.NO_POW_SERVER_AVAILABLE);
        }
    }

    /**
     * reads the address created by the offspring seed and validates its addresses.
     * @param {*} offspringReference 
     */
    async readOffspringReference(offspringReference){
        var t = Date.now();
        this.emitInfo(codes.READING_PAYMENT_CHANNEL, offspringReference);
        var result = await this.iotaMultiNode.findTransactionsObjectsPromise(
            { addresses: [offspringReference] },
             3);
        console.log("Retrieval", Date.now() - t);
        t = Date.now();
        if (result.combinedTransactions.length == 0) {
            //debugger;
            this.emitError(codes.NO_ORIGIN_MESSAGE, this.referenceAddress);
            return false;
        } else {
            this.setupStateFromReferenceTransactions(result.combinedTransactions);
            this.emitInfo(codes.PAYMENT_CHANNEL_READ, offspringReference);
            console.log("Adding", Date.now() - t);
        }
    }

    


    /**
     * In order to check we have a server available that can do Proof of Work
     */
    async canPowBeDone() {
        await this.iotaMultiNode.findPowServer();
        var powServer = this.iotaMultiNode.selectPowServers();
        if (!powServer[0]) {
            this.emitError(codes.NO_POW_SERVER_AVAILABLE)
            return false;
        }
        return true;
    }

    /**
     * Gets the IOTAPAY000 reference manages by this instance.
     */
    getReference() {
        return this.reference;
    }



    getReferenceChecksum() {
        return iotaUtils.addChecksum(this.referenceAddress, 5);
    }

    getHasOriginMessage() {
        return this.getOriginMessage() !== null;
    }

    getOriginMessage() {
        if(this.selectedTimeIndexedObject){
            return this.selectedTimeIndexedObject.getLatestOriginMessage();
        }
        return null;
    }
    getHasComControl() {
        return this.getComControl() !== null;
    }
    getComControl() {
        if(this.selectedTimeIndexedObject){
            return this.selectedTimeIndexedObject.getLatestComControlMessage();
        }
        return null;
    }
    getHasPaymentChannel() {
        return this.getPaymentChannel() !== null;
    }
    getPaymentChannel() {
        if(this.selectedTimeIndexedObject){
            return this.selectedTimeIndexedObject.getLatestPaymentChannelMessage();
        }
        return null;
    }

    
    getOffspringSeeds() {
        var toReturn = [];
        var highestOffspringSeeds = -1;
        Object.values(this.timestampIndexedMap).forEach(timeIndexedMap => {
            highestOffspringSeeds = Math.max(highestOffspringSeeds, timeIndexedMap.getHighestOffspringIndex());
        });
        
        for(var i = 0; i <= highestOffspringSeeds; i++){
            toReturn.push({
                offspringIndex: i,
                offspringSeed: this.getOffspringSeed(i)
            })
        }

        return {
            highestIndex: highestOffspringSeeds,
            offspringSeeds: toReturn
        };
    }
    getOffspringSeed(index) {
      
        return utils.generateOffspringSeed(this.originSeed, this.channelName, index);
    }

    getActiveFastNodes() {

    }

    getActiveValidationNodes() {

    }

    getControlHistory(timestamp = null) {

    }


    emitInfo(...args) {
        this.emit('INFO', reversedCodes[args[0]], args);
    }

    emitWarning(...args) {
        this.emit('WARNING', reversedCodes[args[0]], args);
    }
    emitError(...args) {
        this.emit('ERROR', reversedCodes[args[0]], args);
    }



    keysLoaded() {
        return this.privateKey && this.publicKey;
    }

    getLib() {
        return this.iotaApi;
    }
}



export { utils, getNewPrivateAPI, getNewPublicAPI }