#WORK IN PROGRESS




# IOTA Pay API

IOTA Pay has two API's. One for the creation and management of a channel (private) and one that is used to retrieve an address (public).

The API uses the popular event-emitter to emit events on what it is currently doing and to expose warnings and errors.

For localization reasons we chose to use codes for certain events and corresponding CONST fields to expose them.

Events will be: 
- INFO : All successful info
- WARNING : Something went wrong but could recover.
- ERROR : Processing stopped, and this is the reason.
```javascript
   IOTAPayPublic.on('ERROR', function(code, arg1, arg2, arg3, arg4) {
       //processing
   })
```


## IOTA Pay Public

    npm install iota-pay

The public API is extremely simple and has only two calls.


### Receive an adddress
```javascript
var iotaPAYAPI = IotaPayApi.getNewPublicAPI("IOTAPAY000KMYAAASEBEPLQRWFOWCPYWUZVXPNADTFKWQTTZLLUSYGCNYAUUQJJGKCIHRMKHUYYIUVQTYFU9DNP");
iotaPAYAPI.addListener('INFO', function(code, ...args) {
    console.log("INFO Code:" + code + ": " + args);
});
iotaPAYAPI.addListener('WARNING', function(code, ...args) {
    console.log("WARNING Code:" + code + ": " + args);
});
iotaPAYAPI.addListener('ERROR', function(code, ...args) {
    console.log("ERROR Code:" + code + ": " + args);
});
//Your IOTA Node here here
await iotaPAYAPI.init(['AUTO3']);
var publicAddress = await iotaPAYAPI.getPublicAddress();

document.getElementById("root").innerText = publicAddress.a;
```

### Validate address

If displayed to a user we might want to validate an address periodically.
```javascript
    iotaPay.validate('ADDRESS') // Promise (true/false)
```
    

## IOTA Pay Private

The private part of the API is meant to handle all actions to setup a process and notify

A message declared as **POW** will require proof of work to be completed.


### Constructor
```javascript
    var iotaPay = new IOTAPay(originSeed, privateKeyPEM = null, publicKeyPEM = null, channelName = "IOTAPAY")
```
`originSeed` 81 Trytes seed provided by the user.
`channelName` optional channelName. ChannelName is not remembered and not deterministic! It is your own responsiblity to remember the channelName. The default should mostly suffice.

### Simple fields 

Getters for simple fields to be used outside of the API.

|**Field**|**Description**|
|---|---|
|`getReference()` | The IOTA-Pay reference leading with IOTAPAY000.|
|`getReferenceChecksum()` | 5 character checksum.|
|`getHasOriginMessage()` | Boolean indicating if initialized or not |
|`getOriginMessage()` |  If ORIGIN was found return ORIGIN else `null` |
|`getHasComControl()` | Boolean indicating if an correct COM_CONTROL message was found |
|`getComControl()` |  If COM\_CONTROL was found return COM\_CONTROL else `null` |
|`getHasPaymentChannel()` | Boolan indicating if an correct active PAYMENT_CHANNEL message was found |
|`getPaymentChannel()` | If PAYMENT\_CHANNEL was found return PAYMENT\_CHANNEL else `null` |
|`getOffspringSeeds()` | Array of [`{ offspringIndex:0, offspringSeed:'SDHEWGSD...', offspringReference: 'SDKGSD...' }`, ...] |
|`getActiveFastNodes()` | Array of active nodes for quick retrieval of data. |
|`getActiveValidationNodes()` | Array of validation nodes for validating and broadcasting important information. |
|`getControlHistory(timestamp = null)` | Array of control messages of the current active ORIGIN |


### `init`
```javascript
    var result = await iotaPay.init(servers = ['AUTO1'])
```
`servers` is an array of servers to use when initializing. Later preferences are overwritten by what is found inside the `COM_CONTROL` message. Defaults to 'AUTO1'. Selecting 1 low latency server. The reference application does an AUTO1 a single time and stores it in localstorage.


Returns `TRUE` when succesfully initilized. If no `ORIGIN_MESSAGE` with the correct signature was found it will return `FALSE`. For the channel to be valid as a public reference it needs more control messages.

If `FALSE` is returned, we either need to claim the address.

### `claimReference`  (**POW**)
Claims the address by generating and sending an `ORIGIN`.
If an `ORIGIN` message already exists or the process otherwise fails it returns `FALSE`.
If successfully claimed the address it returns `TRUE`.

    var result = await iotaPay.claimReference(override = false);

`override` forces the creation of a new origin message with a new timestamp. NOTE: This will require the creation of all other control messages and will invalidate the reference until done. The only good reason to force a new ORIGIN is if somehow something went wrong or to upgrade the version of the API. Normally don't use this.

### `updateComControl`  (**POW**)

Updates the `COM_CONTROL` message with new information, just takes the visuals and iotaNodes objects as defined in [`COM_CONTROL`](#message-com_control)
```javascript
    var visuals = {            
            always : {
                name : "Name to display",
                email : "address@mailserver.com",
                website : "http://iota.org"
            },            
            onError : {
                email : "iota_pay_error@mailserver.com"
            }
        };
    var iotaNodes = {
            initNodes : ["AUTO1"],
            transactionNodes : ["Payment preferences nodes", "AUTO3"]
        };
    var result = await iotaPay.updateComControl(visuals, iotaNodes);
```


NOTE: When using AUTO3(or N) on transactionNodes the API will pick 3 geographically split servers and insert them. The point transaction nodes is to have a few single points to check spents on and take away the async nature of IOTA for specific payments.


### `updatePaymentChannel`  (**POW**)

Updates the payment channel to a specific `offspringIndex`.
```javascript
    var result = await iotaPay.updatePaymentChannel(offspringIndex, validations);
```

NOTE: There is no hard requirement of the payment channel to be filled with addresses. It is advised to first fill a payment channel with addresses before updating it.


### `addAddresses`  (**POW**)

Reads the offspringReference ands finds the latest index for corresponding timestampIndex, if none is found it will start generating addresses at index 0.

Adds 50 addresses to the offspringReference.

```javascript
    var result = await iotaPay.addAddresses(offspringIndex);
```
NOTE: Finding no corresponding timestampIndex can be the result of a snapshot. Generating addresses for the channel is fine because it can help recover addresses (however you preferrably do this with a wallet). If you are unsure you are better off increamenting the offspringReference and use a fresh channel. 




### snapshotRecovery (**POW**)

`offspringIndex` Positive interger that should be supplied by local state. The api will generate offspringSeeds until the offspringIndex is reached. If a negative is given the API will retrieve the information from the IOTAPay address.

