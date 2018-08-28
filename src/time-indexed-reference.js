import * as ORIGIN from './messages/ORIGIN';
import * as PAYMENT_CHANNEL from './messages/PAYMENT_CHANNEL';
import * as COM_CONTROL from './messages/COM_CONTROL';
import * as UPGRADE_VERSION from './messages/UPGRADE_VERSION';
import * as TERMINATE from './messages/TERMINATE';
import * as SIGNAL_STOP from './messages/SIGNAL_STOP';
import * as ADD_LIST from './messages/ADD_LIST';

import * as utils from './iota-pay-static';
var messageFunctions = {
    ORIGIN: ORIGIN,
    PAYMENT_CHANNEL: PAYMENT_CHANNEL,
    COM_CONTROL: COM_CONTROL,
    UPGRADE_VERSION: UPGRADE_VERSION,
    TERMINATE: TERMINATE,
    SIGNAL_STOP: SIGNAL_STOP,
    ADD_LIST: ADD_LIST
}

export class TimeIndexedReference {
    constructor(iotaPayReference) {
        this.originMessages = []; //Should not have more than 1 but in case of a mistake it could be possible.
        this.COMControlMessages = [];
        this.upgradeVersionMessages = [];
        this.paymentChannelMessages = [];
        this.activeOriginMessage = null;
        this.activeCOMControl = null;
        this.activePaymentChannel = null;
        this.activeUpgradeVersionMessage = null;
        this.offspringIndexMap = { // Ofspring index map: { 2: PaymentChannel()}

        }
        
        this.iotaPayReference = iotaPayReference;
        this.sortingFunction = (a, b) => a.msg.controlIndex - b.msg.controlIndex;
    }

    addAddresses(offspringIndex, addresses) {
        addresses.forEach(address => {
            if(!this.offspringIndexMap[offspringIndex]){
                this.offspringIndexMap[offspringIndex] = new PaymentChannel(offspringIndex);
            }
            this.offspringIndexMap[offspringIndex].addAddress(address);
        });
    }

    addMessage(message) {
        switch (message.msgType) {
            case "ORIGIN":
                this.originMessages.push(message);
                this.activeOriginMessage = null;
                break;
            case "PAYMENT_CHANNEL":
                this.paymentChannelMessages.push(message);
                this.activePaymentChannel = null;
                break;
            case "COM_CONTROL":
                this.COMControlMessages.push(message);
                this.activeCOMControl = null;
                break; 
            case "UPGRADE_VERSION":
                this.upgradeVersionMessages.push(message);
                this.activeUpgradeVersionMessage = null;
                break;
            case "ADD_LIST":
                //Addres messages are always validated, we dont want invalid addresses
                //anywhere in memory.
                //debugger;
                if(messageFunctions.ADD_LIST.verifySignature(message, this.getPublicKey())){
                    //debugger;
                    this.addAddresses(message.msg.offspringIndex, message.msg.addresses);
                }
                
                break;
        }
    }

    getHighestOffspringIndex(){
        var maxIndex = -1;
        Object.keys(this.offspringIndexMap).forEach(offspringIndex => {
            maxIndex = Math.max(maxIndex, offspringIndex);
        })
        return maxIndex;
    }

    getActiveOffspringIndex(){
        var paymentChannel = this.getLatestPaymentChannelMessage();
        if(paymentChannel){
            return paymentChannel.msg.offspringIndex;
        }
        return 0;
    }

    getActiveAddresses(){
        var offspringIndex = this.getActiveOffspringIndex();
        if(!this.offspringIndexMap[offspringIndex]){
            return [];
        }
        return this.offspringIndexMap[offspringIndex].getAddressList();
    }

    getHighestOffspringAddressIndex(offspringIndex){
        if(!this.offspringIndexMap[offspringIndex]){
            this.offspringIndexMap[offspringIndex] = new PaymentChannel();
        }
        //debugger;
        return this.offspringIndexMap[offspringIndex].getHighestAddressIndex();
    }

    //Used to determin nextControl index
    getLatestControlMessage() {
        var latest = this.getLatestOriginMessage();
        var comcontrol = this.getLatestComControlMessage();
        var paymentchannel = this.getLatestPaymentChannelMessage();

        if (latest && comcontrol && comcontrol.msg.controlIndex > latest.msg.controlIndex) {
            latest = comcontrol;
        }

        if (latest && paymentchannel && paymentchannel.msg.controlIndex > latest.msg.controlIndex) {
            latest = paymentchannel;
        }

        return latest;
    }

    getLatestOriginMessage() {
        if (this.activeOriginMessage === null) {
            this
                .originMessages
                .sort(this.sortingFunction);
            for (var i = this.originMessages.length - 1; i >= 0; i--) {
                //First check if the reference is right because it is a lighter to do so.
                if (this.iotaPayReference == utils.getIOTAPayReference(this.originMessages[i])) {
                    if (messageFunctions.ORIGIN.verifySignature(this.originMessages[i], this.originMessages[i].msg.publicKey)) {
                        this.activeOriginMessage = this.originMessages[i];
                        break;
                    }
                }
            }
        }
        return this.activeOriginMessage;
    }

    getLatestUpgradeVersionMessage() {
        if (this.activeUpgradeVersionMessage === null) {
            this.upgradeVersionMessages.sort(this.sortingFunction);
            for (var i = this.upgradeVersionMessages.length - 1; i >= 0; i--) {                
                if (messageFunctions.ORIGIN.verifySignature(this.upgradeVersionMessages[i], this.upgradeVersionMessages[i].msg.publicKey)) {
                    this.activeUpgradeVersionMessage = this.upgradeVersionMessages[i];
                    break;
                }                
            }
        }
        return this.activeUpgradeVersionMessage;
    }

    getLatestComControlMessage() {
        if (this.activeCOMControl === null) {
            this.COMControlMessages.sort(this.sortingFunction);
            for (var i = this.COMControlMessages.length - 1; i >= 0; i--) {
                if (messageFunctions.COM_CONTROL.verifySignature(this.COMControlMessages[i], this.getPublicKey())) {
                    this.activeCOMControl = this.COMControlMessages[i];
                    break;
                }
            }
        }
        return this.activeCOMControl;
    }

    getLatestPaymentChannelMessage() {
        if (this.activePaymentChannel === null) {
            this.paymentChannelMessages.sort(this.sortingFunction);
            for (var i = this.paymentChannelMessages.length - 1; i >= 0; i--) {
                if (messageFunctions.PAYMENT_CHANNEL.verifySignature(this.paymentChannelMessages[i], this.getPublicKey())) {
                    this.activePaymentChannel = this.paymentChannelMessages[i];
                    break;
                }
            }
        }
        return this.activePaymentChannel;
    }

    getPublicKey() {
        return this.getLatestOriginMessage().msg.publicKey;
    }

}

export class PaymentChannel{
    constructor(offspringIndex){
        this.offspringIndex = offspringIndex;       
        this.addresses = [];
        this.highestAddress = null;
        
    }
    sortAddresses(){
        this.addresses.sort((a, b) => a.i - b.i);
    }
    getHighestAddressIndex(){
        
        if(!this.highestAddress){
            this.sortAddresses();
            this.highestAddress = this.addresses[this.addresses.length - 1]
        }
        if(this.highestAddress){
            return this.highestAddress.i;
        }
        return -1;
    }

    addAddress(address){
        //We only want unique addresses.   
        var found = false;
        for(var i = 0; i < this.addresses.length; i++) {
            if (this.addresses[i].i == address.i) {
                found = true;
                break;
            }
        }
        if(!found){
            address.isSpentFrom = null;
            address.balance = -1;
            address.transactions = [];
            address.validations = {
                //METHOD: True/False
            };
            address.isCandidate = function(){       
                var candidate = true;     
                Object.keys(this.validations).forEach(validation =>{
                    if(!this.validations[validation]){                      
                        candidate = false;
                    }
                })
                return candidate;
            }
            address._localChecksum = null;
            address.checkSum = function() {
              
                if(!this._localChecksum){
                    this._localChecksum = utils.staticIOTA.utils.addChecksum(address.a);
                }
                return this._localChecksum;
            };

            this.addresses.push(address);
            this.highestAddress = null;
        }       
    }

    resetValidations(){
        this.addresses.forEach(address => {
            address.isSpentFrom = null;
            address.balance = -1;
            address.transactions = [];
        });
    }

    getAddressList(){
        if(!this.highestAddress){
            this.sortAddresses();
        }
        return this.addresses;
    }
}