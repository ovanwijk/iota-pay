//import IotaPay from "./src/iota-pay-api";
//import { IotaEncryption } from './src/iota-encryption';



var iotaPay = require("./dist/iota-pay-api.js");
var cryptico = require("cryptico");






var pay = new iotaPay.IotaPay('https://field.carriota.com:443')
var enc = new iotaPay.IotaEncryption("SEED0", pay.getLib())

var msg = "A".repeat(1000) +  "B".repeat(1000) +"C".repeat(1000) +"D".repeat(1000) +"E".repeat(1000) +"F".repeat(1000) 

//var aa =iotaPay.transfersToBundle([{value:0, message: msg}])
//debugger;
//console.log(aa);
enc.newKeyPair().then(result => {
   // console.log(result);
})