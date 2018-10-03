

# IOTA Pay

An easy interface to a create single references that can be shared for future payments to the reference holder.
This solution is 100% tangle based and has no central authorities and no servers. 

Everyone will be free to implement this, exchanges, commerce, wallets etc.


The reference implementation that can be used for public references like donation links will soon be uploaded here:
https://github.com/ovanwijk/iota-pay-reference-implementation

You can scan the QR code for donations or follow the link 
[here](https://iota-apy.herokuapp.com/#/IOTAPAY000AKRRYXDOVKRPXH9KUBEATTKWYLUJATXLKRPXWP9ZQIDUAHWENCMGQKOLHETNMAMXHPOZBVGBTWOCAOCUS)


![Ooops](/IOTAPAY_donate.png?raw=true "Donation QR code")

The end goal of IOTA Pay is that the reference implementation is no longer required(always good to have an independant tool) and all wallets support automatic address generation and management for IOTA Pay allowing for a much better user experience using IOTA.


# IOTA Pay technical description

IOTA Pay uses ECDSA Signatures to provide a unique reference that can survive snapshots and that can be used in symbiosis of popular wallets like the Trinity Wallet.

When talking about iHash() we talk about the IOTA used hashing function with an output of 81 trytes. It is used heavily throughout IOTA Pay.

The Origin Seed: the seed that the user needs to provide, this CAN be an IOTA 81 trytes based seed but is not required. It can literally be any string. This includes popular 12 word seeds.

Offspring Seeds: seeds that are deterministically generated from the Origin seed. These are the seeds that are used to generate addresses and thus how to access the IOTA's.

AUTO5 is used to reference IOTAPUBLICNODESELECTOIN, times number. So AUTO1 = select max 1 server. AUTO5 = select 5 servers.

A valid IOTA Pay reference contains the following:
- At least 1 ORIGIN message
- At least 1 PAYMENT_CHANNEL message
- At least 1 COM_CONTROL message
- At least 1 list of addresses (ADD_LIST) in the PAYMENT_CHANNEL reference

## The IOTA Pay reference

The unique reference is an address generated in the following matter:

At first an Origin message is created and signed(msgType + channelName +  publicKey +version + controlIndex).

The public and private ECDSA key pair can be generated using a deterministic seeded random generator with [Origin seed] as input. This is the default behavior but keys are treated as PEM. Meaning that you are complete free to generate your own "secp256k1" keys. (These are the same keys as bitcoin )
```json
    {
      "msgType": "ORIGIN",
      "msg" : {
        "channelName" : "IOTAPAY",
        "version" : 1,
        "method" : "ECDSA-SHA256",
        "publicKey" : "ECDSA Public key",      
        "controlIndex" : 0,
        "timestampIndex" : 14000000
      },
      "excludeFromSignature": {
            "timestampIndex": true
        },
      "signature" : "ECDSA signature"
    }
```
    sign(msgType + channelName + publicKey + version + controlIndex)

    //NOTE: we don't include timestampIndex in the signature because in case of snapshots we cannot reconstruct the address.
    
    //Second NOTE: version is included for depreciation reasons, versioning must exist from version 1.

The address this message is sent to is produced like this: IOTAPAY000 + iHash(origin.signature). The address will be the unique reference used by IOTA Pay (IPR). The reason for the prefix is that it will be very obvious it is NOT an address. The same reason is there for the tailing zero's 000, because those are not trytes(A-Z9). Any IOTA code -not specifically dealing with IOTA-Pay- should therefore fail at validating the trytes.



WARNING: There is an option to give a channelName , this is external state! In case of a snapshot someone must remember the channelName in order to reclaim their IOTA's!!!! So do not use this unless you know what you are doing!

The reason for starting off like this is as followed:

- To be able to 'reclaim' the IPR after a snapshot.

- To provide a public key for future control messages to be validated.

## Control messages:
Control messages are index based messages signed with the private key. The first message; the [origin message] always has controlIndex: 0 and a timestampIndex of when it was created. If in case of permanodes and snapshots multiple [origin messages] can exists. The one with the highest timestampIndex should be chosen as "true" so don't manually make messages with the same timestampIndex (The API prevents this).

All other messages must have an increasing controlIndex and share the same timestampIndex as the corresponding [origin message].

### Message: PAYMENT\_CHANNEL

This control message is meant to direct the receiver of the IPR to an offspringReference. The highest highest controlIndex from the highest timestampIndex is considered the one to use.
```json
    {
      "msgType": "PAYMENT_CHANNEL",
      "msg": {
        "controlIndex" : 1,
        "timestampIndex" : 1400000,
        "offspringIndex" : 0,        
        "offspringReference" : "PAYMENTCHANNELADDRESS",
        "validations" : ['ArrayOfValidationMethods'],
      }
      "signature": ""
    }
```
    sign(msgType + timestampIndex + controlIndex + reference + offspring + validations)

`controlIndex`, `timestampIndex`, `msgType`, `signature` speak for themselves. 

`offspringIndex` is used to deterministically generate new [offspring seeds]. It does this by the following: iHash([origin seed] + channelName + offspringIndex) == [offspring seed].
The `offspringReference` is calculated as followed iHash([offspring seed] + channelName)

`Validations` is an array of validation methods that can be registered to detect when an address is still valid to be used, outside of the obvious reason that it was already spent from. Validation methods are extendable but some ship with the library, available ones are in a different section.

NOTE: An updating control message can be send to change validations.

### Message: COM_CONTROL

This message is meant to provide information to personalize the display page.

Outside display information it can hold preferences for server connections for fast backend processing. 
```json
    {
      "msgType": "COM_CONTROL",
      "msg" : {
        "controlIndex" : 1,
        "timestampIndex" : 1400000,
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
            "transactionNodes" : ["Payment preferences nodes", "AUTO3"]
        }
      },
      "signature": ""
    }
```
    sign(msgType + timestampIndex + controlIndex + visuals + iotaNodes)

The [visuals] field is to show visuals on the site, naturally it first needs to be loaded before it can take any effect.

I propose to use an url encoded ?visuals= query parameter to be used in a URL referenceing the IOTA-Pay application.

The [onError] and [always] options are there to distinguish when certain information needs to be showed. The reference implementation will only use contact information when an error occurs (like no addresses or empty reference after snapshot) and will display Name, Email and Website. However you are allowed to create fields as you go.

The [iotaNodes] field is used to direct preferences on IOTA nodes. Could be overwritten in a URL with initNodes = urlencode(["nodes"]). Overriding [iotaNodes] can cause the application to load slower due to latency but can give a higher degree of certainty. 

[transactionNodes] is the most important setting. This will be used to check if an address is already spent from. Since the async nature of IOTA a transaction sent to a point in the network might not be immediately discoverable by another part of the network. [transactionNodes] is meant to close the async gap to prevent sending funds to an already used address.

**IMPORTANT!:** In order to be safe, the owner of the IOTA-Pay reference should use one of the [transactionNodes] to spend their IOTA from. Or use [Signal stop]

Ideally the [transactionNodes] are also displayed to the consumer of the IOTA-Pay reference. A user is of course free to decide what nodes to use but is a means to suggest nodes. Wallet integration could automate this process.


Besides for visual information transactionNodes are also queried extra to prevent address re-use and used to send future CONTROL messages to.



### Message: TERMINATE

Terminates the IOTA Pay Reference permanently. Once this message is found all other actions are blocked.
It therefore does not require any other information. This is irreversable.

NOTE: The terminate message is a means to protect against potential future quantum computers and key theft. This so that the key owner can always have a kill-switch so someone cannot hi-jack the reference and post different addresses.

```json
    {       
      "msgType": "TERMINATE",  
      "msg": {
          "signal": "TERMINATE"
      },    
      "signature": ""
    }    
```
    sign(msgType)



### Message: SIGNAL\_STOP

This message is not part of the control messages on the IPR but sent to an actual IOTA address to signal the SIGNAL\_STOP\_VALIDATION method to return false. So we can tag an address to be no longer used without the need to spend from it first.

```json
    {       
      "msgType": "SIGNAL_STOP", 
      "msg": {
          "signal": "SIGNAL_STOP",
          "address": "address"
      },     
      "signature": ""
    }
```
    sign(msgType + address)

We advise to alway send a SIGNAL_STOP to the address before spending from it! Ideally some time before so no 'in flight' address selections might occur. This is not enforceable but important to consider!.


### Message: UPGRADE\_VERSION

A message meant to include backward and forward compatibility to updates of the IOTA Pay API.
```json
    {
      "msgType": "UPGRADE_VERSION",
      "msg":  {
            "controlIndex" : 1,
            "timestampIndex" : 1400000,
            "reference" : "NEW IOTA pay reference"
      },
      "signature": ""
    }
    sign(msgType  + timestampIndex + controlIndex + reference)
```
NOTE: Follow up on version upgrades not yet implemented.
## Validation methods

Validation methods provide a way to control when an address should not be used anymore.

Address validation methods are processed after calling [wereAddressesSpentFrom & getBalances] and a single address comes out of the default group validation as a candidate. Validation methods are defined as jsons and free form arguments specific to the function.

The first input of the function is always an address object with it separated inputs and output transfers
```json
    {
        "method": "METHOD",
        "arguments" : [
            "arg1",
            0,
            0.6
            
        ]
    }
```
### Validation: SIGNAL\_STOP

Validations whether an address has a valid SIGNAL_STOP message.
```json
    {
        "method": "SIGNAL_STOP",
        "arguments" : [
            ["transactionNodes"]
        ]
    }
```
NOTE: SIGNAL_STOP is required, if it is not given it still executed. Default params: ["transactionNodes"]

### Validation: HAS\_OUTPUTS

Validations whether an address is used as an input on other transactions. (been spent from)
```json
    {
        "method": "HAS_OUTPUTS",
        "arguments" : [
            ["transactionNodes", "AUTO3", "https://manualnode.net:443"]
        ]
    }
```
NOTE: HAS_OUTPUTS is required, if it is not given it still executed. Default params: ["transactionNodes"]

### Validation: MORE\_SPENT\_FROM

Checks multiple servers for the wereAddressesSpentFrom but then for a single address.
```json
    {
        "method": "MORE_SPENT_FROM",
        "arguments" : [
            ["servers1:1465", "AUTO3"]
        ]
    }
```

### Validation: MAX\_INPUTS

Skips an address if it had X inputs as payments
```json
    {
        "method": "MAX_INPUTS",
        "arguments" : [
            1, //Switches after each payment.
            ["AUTO1"]
        ]
    }
```

### Validation: MAX\_FUNDS

Skips an address if it has a minimum of X IOTA in it.
```json
    {
        "method": "MAX_FUNDS",
        "arguments" : [
            100000, //Funds in IOTA (Not MIOTA).
            ["AUTO1"]
        ]
    }
```


## The Payment channel

The Payment channel is generated using the iHash([offspring seed] + channelName) that comes from the control message PAYMENT_CHANNEL.

Each bundle sent to the address should have a list of N addresses and a signature.


In general:

Less addresses more chatter.

More addresses means more proof of work to be performed when registering the addresses.

The message is very simple, all addresses are of security 2:
```json
    {
        "msgType" : "ADD_LIST",
        "msg" : {
        "timestampIndex": 140000,
        "offspringIndex": 0,
        "addresses": [
        {"a": "ADDRESS", "i" : 0},
        {"a": "ADDRESS", "i" : 1},
        {"a": "ADDRESS", "i" : 2},
        {"a": "ADDRESS", "i" : 3}
        ...
        ]
        },
        
        "signature" : ""
    }
```
    sign(timestampIndex + offspringIndex + addresses)

`timestampIndex` should be the same as the PAYMENT_CHANNEL message referencing it.

This index("i") is used to determine future address generation and to give information so it is possible to manually access addresses with funds. This is however the default behavior of the API, technically you are free to place any address in this list.


## IOTA-Pay reference to address procedure

0. If visuals query parameter is set, update the page.
1. Remove the IOTAPAY000 from the IOTA-Pay reference.
2. Select iota nodes given in queryParameter initNodes or AUTO1
3. Retrieve all transactions from the IOTA-Pay references address.
4. Parse the messages into jsons.
5. Group on timestampIndex
6. Select highest timestampIndex group
7. Sort messages on controlIndex
8. Select the ORIGIN message and obtain the public key.
9. Validate the address by checking the ORIGINs message signature and hash the signature. 
10. Select the latest COM_CONTROL message, validate, and update the UI where needed and user IOTA nodes referenced here
11. Select the latest PAYMENT_CHANNEL message, validate and retrieve `offspringReference`.
12. Read the `offspringReference` and receive a list of addresses.
13. Execute wereAddressesSpentFrom on all addresses, select the first address for thorough checking. If not available repeat step 12.
14. Execute all validations, if one returns false repeat step 13. If no valid address can be found return with an error message.
15. After address selection display the address with checksum to the user.
16. Repeat validation steps each x time.


## Snapshot recovery information


NOTE: Snapshot recovery is not an integral part of the IOTA-Pay API, the reference implementation will provide a way to deal with snapshots for basic users. It is a process we call [reclaiming] and will be initiated after login with your seed if an empty IPR is found.


### For the developers:
A IOTA-Pay Reference stays valid after a snapshot, however all information required to get an address will be purged.
However if you run your own node or run your own perma-node re-initialization of the IOTA-Pay Reference is not required.
So only when you control your own nodes and don't apply snapshots AND use initNodes in your IOTA-Pay reference URL's you will not need to recover your IOTA-Pay references. This might only feasible for exchanges or larger coorperations. Services could be build around this but the idea is to make the core of IOTA-Pay as decentralized as possible.



### For the users: (not avaialble yet)
As the creator of an IOTA-Pay Reference you will have have different options for recovery but there is only one supported  way for discovery.

Each time a change is made to your IPR the page will suggest to download the latest xxxxx.iotapay file. You will have to keep this file safe in order to recover your state after a snapshot. Since this file is encrypted with your seed it is suggested to store it together with your seed.

In the very basics this file contains only 1 important number. Which is small so it is easy to remember. Failing to provide the correct number MIGHT result in an address being exposed that has already been spent from.

Lost your file? Not directly a problem as services like thetangle.org act as a permanode and snapshots hold balances of addresses. Recovery does require manual work and is tedious, but funds are always recoverable.
In the first version only file based recovery will be supported.




# Known attack vectors and potential solutions

There are a few possible attack vectors when it comes to IOTA Pay. They are however the same attack vectors when it comes to MAM. Mainly the address denial attack.

### Address denial attack

In short this means that if a public address is known an attacker can send many transactions to an address to make loading times impossible.


One solutions could be that IOTA implements paging in the findTransactions so we could stream through data.


Another solution would be to implement and Iota Extention Interface that could be requested to delete a set of transactions from the findTransaction index that are not signed with the correct key. To make this more useful we might need to clearly indicate what needed signature parts the signing from the message so the system of claiming an address becomes more universal.


